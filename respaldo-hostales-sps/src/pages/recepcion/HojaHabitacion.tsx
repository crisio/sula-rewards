import { useMemo, useRef, useState } from 'react'
import type { EstadoHabitacion } from '../../../shared/calculos'
import { fechaCorta, horaHN, horaBonita } from '../../../shared/fechas'
import { NOMBRE_PAGO, PAGOS, precioLista, TIPOS, type Habitacion, type Hostal, type Pago, type Registro, type TipoHabitacion } from '../../../shared/reglas'
import { api, ahoraServidor, urlDeFoto } from '../../lib/api'
import { subirFoto } from '../../lib/foto'
import { duracion, lempiras } from '../../lib/formato'
import { useSesion } from '../../lib/sesion'
import { Autocompletar, CampoMonto, Hoja, Icono, Opciones, type Sugerencia } from '../../components/ui'
import { useHoy, type Sugerencias } from './contexto'

type PagoOpcion = Pago | 'pendiente'

const ETIQUETA: Record<EstadoHabitacion['estado'], string> = {
  libre: 'Libre',
  ocupada: 'Ocupada',
  hora: 'Por hora',
  sale: 'Sale hoy',
  limpieza: 'Limpieza',
}

export function HojaHabitacion({ hab, estado, onCerrar, fecha }: { hab: Habitacion; estado: EstadoHabitacion; onCerrar: () => void; fecha?: string }) {
  const { datos } = useHoy()
  const [vista, setVista] = useState<'inicio' | 'form' | 'anular'>(estado.estado === 'libre' ? 'form' : 'inicio')
  const r = estado.registro
  if (!datos) return null
  const h = datos.hostal

  const titulo = `Habitación ${hab.numero}`
  const subtitulo = estado.estado === 'libre' ? `Libre · ${fechaCorta(fecha ?? datos.fecha)}` : ETIQUETA[estado.estado]

  if (vista === 'form') {
    const editar = estado.estado === 'ocupada' || estado.estado === 'hora' ? r : undefined
    return (
      <Hoja titulo={titulo} subtitulo={editar ? 'Editar registro' : subtitulo} onCerrar={onCerrar}>
        <FormRegistro hab={hab} hostal={h} registro={editar} fecha={fecha} onListo={onCerrar} />
      </Hoja>
    )
  }
  if (vista === 'anular' && r) {
    return (
      <Hoja titulo={titulo} subtitulo="Anular registro" onCerrar={onCerrar}>
        <Anular registro={r} onListo={onCerrar} />
      </Hoja>
    )
  }

  return (
    <Hoja titulo={titulo} subtitulo={subtitulo} onCerrar={onCerrar}>
      {r && <FichaRegistro r={r} />}
      {estado.estado === 'sale' && r && <AccionesSale r={r} hostal={h} onCerrar={onCerrar} onNuevo={() => setVista('form')} />}
      {estado.estado === 'hora' && r && <CerrarHora r={r} onCerrar={onCerrar} onEditar={() => setVista('form')} onAnular={() => setVista('anular')} />}
      {estado.estado === 'limpieza' && <AccionesLimpieza hab={hab} estado={estado} onCerrar={onCerrar} onNuevo={() => setVista('form')} />}
      {estado.estado === 'ocupada' && r && <AccionesOcupada r={r} onCerrar={onCerrar} onEditar={() => setVista('form')} onAnular={() => setVista('anular')} />}
    </Hoja>
  )
}

export function FichaRegistro({ r }: { r: Registro }) {
  const ahora = ahoraServidor()
  return (
    <div className="tarjeta" style={{ marginBottom: 16 }}>
      <div style={{ fontSize: '1.25rem', fontWeight: 800 }}>{r.huesped}</div>
      {r.empresa && <div className="muted">{r.empresa}</div>}
      <div className="llave-insignias" style={{ marginTop: 10 }}>
        <span className="chip">{r.modo === 'hora' ? 'Por hora' : r.tipo}</span>
        <span className="chip">{r.pago === 'credito' ? `Crédito · ${lempiras(r.precio)}` : lempiras(r.precio)}</span>
        <span className={`chip`} style={r.pago ? undefined : { color: 'var(--danger)' }}>
          {r.pago ? NOMBRE_PAGO[r.pago] : 'Sin forma de pago'}
        </span>
        {r.larga && <span className="chip">Estadía larga</span>}
      </div>
      <p className="muted peq" style={{ margin: '10px 0 0' }}>
        {r.modo === 'hora'
          ? `Entró ${horaHN(r.entrada_en)}${r.salida_en ? ` · salió ${horaHN(r.salida_en)}` : ` · lleva ${duracion(ahora - r.entrada_en)}`}`
          : `Noche del ${fechaCorta(r.fecha)}`}
        {r.creado_por_nombre ? ` · registró ${r.creado_por_nombre}` : ''}
        {r.origen === 'copiado' ? ' (sigue de ayer)' : r.origen === 'importado' ? ' (importado)' : ''}
      </p>
      {r.nota && <p style={{ margin: '8px 0 0' }}>📝 {r.nota}</p>}
      {r.foto_id && <VerFoto id={r.foto_id} />}
    </div>
  )
}

export function VerFoto({ id, texto = 'Ver foto' }: { id: string; texto?: string }) {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState(false)
  if (url)
    return (
      <a href={url} target="_blank" rel="noreferrer">
        <img src={url} alt="Foto" className="foto-mini" style={{ marginTop: 10 }} />
      </a>
    )
  return (
    <button
      type="button"
      className="btn chico"
      style={{ marginTop: 10 }}
      onClick={() =>
        urlDeFoto(id)
          .then(setUrl)
          .catch(() => setError(true))
      }
    >
      <Icono nombre="camara" tam={16} /> {error ? 'No se pudo abrir' : texto}
    </button>
  )
}

function useAccion() {
  const { despuesDeGuardar, avisar } = useHoy()
  const [ocupado, setOcupado] = useState(false)
  const correr = async (fn: () => Promise<unknown>, texto: string, alTerminar?: () => void) => {
    setOcupado(true)
    try {
      await fn()
      await despuesDeGuardar(texto)
      alTerminar?.()
    } catch (e) {
      avisar((e as Error).message, 'error')
    } finally {
      setOcupado(false)
    }
  }
  return { ocupado, correr }
}

function AccionesSale({ r, hostal, onCerrar, onNuevo }: { r: Registro; hostal: Hostal; onCerrar: () => void; onNuevo: () => void }) {
  const { hostalId } = useHoy()
  const { ocupado, correr } = useAccion()
  return (
    <>
      <p className="muted" style={{ marginTop: 0 }}>
        Durmió anoche. Sale a las {horaBonita(hostal.hora_salida)} si no se copia a hoy.
      </p>
      <div className="acciones" style={{ flexDirection: 'column' }}>
        <button
          type="button"
          className="btn primario grande ancho"
          disabled={ocupado}
          onClick={() => correr(() => api(`/hostales/${hostalId}/copiar`, { method: 'POST', json: { ids: [r.id] } }), `${r.huesped} sigue otra noche`, onCerrar)}
        >
          Sigue otra noche
        </button>
        <button type="button" className="btn grande ancho" disabled={ocupado} onClick={() => correr(() => api(`/registros/${r.id}/salida`, { method: 'POST', json: {} }), 'Salida registrada', onCerrar)}>
          Ya salió
        </button>
        <button type="button" className="btn fantasma ancho" onClick={onNuevo}>
          Registrar a otro huésped
        </button>
      </div>
    </>
  )
}

function AccionesLimpieza({ hab, estado, onCerrar, onNuevo }: { hab: Habitacion; estado: EstadoHabitacion; onCerrar: () => void; onNuevo: () => void }) {
  const { hostalId } = useHoy()
  const { ocupado, correr } = useAccion()
  return (
    <>
      <p className="muted" style={{ marginTop: 0 }}>
        {estado.registro ? `Salió ${estado.registro.huesped}${estado.registro.salida_en ? ` a las ${horaHN(estado.registro.salida_en)}` : ''}. ` : ''}
        Cuando esté limpia, márcala como lista.
      </p>
      {estado.nocheVendida && <p className="banda aviso">La noche de hoy de esta habitación ya está vendida (el huésped salió antes).</p>}
      <div className="acciones" style={{ flexDirection: 'column' }}>
        <button type="button" className="btn primario grande ancho" disabled={ocupado} onClick={() => correr(() => api(`/hostales/${hostalId}/habitaciones/${hab.numero}/lista`, { method: 'POST' }), `Habitación ${hab.numero} lista`, onCerrar)}>
          Marcar lista
        </button>
        <button type="button" className="btn ancho" onClick={onNuevo}>
          Registrar huésped
        </button>
      </div>
    </>
  )
}

function AccionesOcupada({ r, onCerrar, onEditar, onAnular }: { r: Registro; onCerrar: () => void; onEditar: () => void; onAnular: () => void }) {
  const { ocupado, correr } = useAccion()
  const [pago, setPago] = useState<Pago | null>(null)
  return (
    <>
      {!r.pago && (
        <div className="campo">
          <span>Registrar el pago</span>
          <Opciones<Pago> valor={pago} opciones={PAGOS.filter((p) => p !== 'credito' || r.empresa_id).map((p) => ({ valor: p, texto: NOMBRE_PAGO[p] }))} onCambio={setPago} />
          {pago && (
            <button type="button" className="btn primario ancho" style={{ marginTop: 8 }} disabled={ocupado} onClick={() => correr(() => api(`/registros/${r.id}`, { method: 'PATCH', json: { pago } }), 'Pago registrado', onCerrar)}>
              Guardar {NOMBRE_PAGO[pago]}
            </button>
          )}
        </div>
      )}
      <div className="acciones" style={{ flexDirection: 'column' }}>
        <button type="button" className="btn grande ancho" onClick={onEditar}>
          Editar
        </button>
        <button type="button" className="btn ancho" disabled={ocupado} onClick={() => correr(() => api(`/registros/${r.id}/salida`, { method: 'POST', json: {} }), 'Salida registrada', onCerrar)}>
          Salió antes (pasa a limpieza)
        </button>
        <button type="button" className="btn peligro ancho" onClick={onAnular}>
          Anular registro
        </button>
      </div>
    </>
  )
}

function CerrarHora({ r, onCerrar, onEditar, onAnular }: { r: Registro; onCerrar: () => void; onEditar: () => void; onAnular: () => void }) {
  const { datos, empresas } = useHoy()
  const { ocupado, correr } = useAccion()
  const [precio, setPrecio] = useState<number | null>(r.precio ?? datos?.hostal.precio_hora ?? null)
  const [pago, setPago] = useState<PagoOpcion>(r.pago ?? 'efectivo')
  const [empresa, setEmpresa] = useState(r.empresa ?? '')
  const faltaEmpresa = pago === 'credito' && !empresa.trim()
  return (
    <>
      <div className="campo">
        <span>Precio</span>
        <CampoMonto valor={precio} onCambio={setPrecio} placeholder="Escribe el monto" />
      </div>
      <div className="campo">
        <span>Forma de pago</span>
        <Opciones<PagoOpcion> valor={pago} opciones={[...PAGOS.map((p) => ({ valor: p as PagoOpcion, texto: NOMBRE_PAGO[p] })), { valor: 'pendiente', texto: 'Pendiente' }]} onCambio={setPago} />
      </div>
      {pago === 'credito' && (
        <div className="campo">
          <span>Empresa</span>
          <Autocompletar valor={empresa} onCambio={setEmpresa} sugerencias={sugerenciasEmpresas(empresas)} placeholder="Empresa" />
        </div>
      )}
      <div className="acciones" style={{ flexDirection: 'column' }}>
        <button
          type="button"
          className="btn primario grande ancho"
          disabled={ocupado || faltaEmpresa || (pago !== 'pendiente' && pago !== 'credito' && precio == null)}
          onClick={() =>
            correr(
              () => api(`/registros/${r.id}/salida`, { method: 'POST', json: { precio, pago: pago === 'pendiente' ? null : pago, ...(pago === 'credito' ? { empresa } : {}) } }),
              'Alquiler por hora cerrado',
              onCerrar,
            )
          }
        >
          Cerrar alquiler por hora
        </button>
        <button type="button" className="btn ancho" onClick={onEditar}>
          Editar
        </button>
        <button type="button" className="btn peligro ancho" onClick={onAnular}>
          Anular
        </button>
      </div>
    </>
  )
}

export function Anular({ registro, onListo }: { registro: Registro; onListo: () => void }) {
  const { ocupado, correr } = useAccion()
  const [motivo, setMotivo] = useState('')
  return (
    <>
      <p style={{ marginTop: 0 }}>
        Se anula el registro de <b>{registro.huesped}</b>. Queda en el historial con tu nombre y el motivo.
      </p>
      <label className="campo">
        <span>¿Por qué se anula?</span>
        <input className="entrada" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej. se registró en la habitación equivocada" autoFocus />
      </label>
      <button type="button" className="btn peligro grande ancho" disabled={ocupado || !motivo.trim()} onClick={() => correr(() => api(`/registros/${registro.id}/anular`, { method: 'POST', json: { motivo } }), 'Registro anulado', onListo)}>
        Anular registro
      </button>
    </>
  )
}

export function sugerenciasEmpresas(empresas: { nombre: string; alias: string[]; activa: boolean }[]): Sugerencia[] {
  const out: Sugerencia[] = []
  for (const e of empresas.filter((x) => x.activa)) {
    out.push({ valor: e.nombre, detalle: e.alias.length ? `También: ${e.alias.join(', ')}` : undefined })
    for (const a of e.alias) out.push({ valor: e.nombre, detalle: `Aparece como «${a}»`, datos: a })
  }
  return out
}

/** Registrar o editar una noche (o un alquiler por hora). */
export function FormRegistro({ hab, hostal, registro, fecha, onListo }: { hab: Habitacion; hostal: Hostal; registro?: Registro; fecha?: string; onListo: () => void }) {
  const { hostalId, sugerencias, empresas, despuesDeGuardar } = useHoy()
  const { usuario } = useSesion()
  const editando = Boolean(registro)
  const [modo, setModo] = useState<'noche' | 'hora'>(registro?.modo ?? 'noche')
  const [huesped, setHuesped] = useState(registro?.huesped === 'Por hora' ? '' : (registro?.huesped ?? ''))
  const [empresa, setEmpresa] = useState(registro?.empresa ?? '')
  const tipoInicial = registro?.tipo ?? sugerencias.tipos[hab.numero] ?? hab.tipo
  const [tipo, setTipo] = useState<TipoHabitacion>(tipoInicial)
  const [larga, setLarga] = useState(registro?.larga ?? false)
  const [pago, setPago] = useState<PagoOpcion | null>(registro ? (registro.pago ?? 'pendiente') : null)
  const sugerido = (t: TipoHabitacion, l: boolean) => precioLista(hostal, t) - (l ? hostal.descuento_larga : 0)
  const [precio, setPrecio] = useState<number | null>(registro ? registro.precio : sugerido(tipoInicial, false))
  const [precioHora, setPrecioHora] = useState<number | null>(registro?.modo === 'hora' ? registro.precio : hostal.precio_hora)
  const [nota, setNota] = useState(registro?.nota ?? '')
  const [fotoId, setFotoId] = useState<string | null>(registro?.foto_id ?? null)
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const precioTocado = useRef(Boolean(registro))
  const archivo = useRef<HTMLInputElement>(null)

  const sugHuespedes = useMemo<Sugerencia[]>(
    () => sugerencias.huespedes.map((x) => ({ valor: x.huesped, detalle: [x.empresa, x.tipo, `última noche ${fechaCorta(x.fecha, false)}`].filter(Boolean).join(' · '), datos: x })),
    [sugerencias.huespedes],
  )
  const sugEmpresas = useMemo(() => sugerenciasEmpresas(empresas), [empresas])

  const cambiarTipo = (t: TipoHabitacion) => {
    setTipo(t)
    if (!precioTocado.current) setPrecio(sugerido(t, larga))
  }
  const cambiarLarga = (l: boolean) => {
    setLarga(l)
    if (!precioTocado.current || precio === sugerido(tipo, larga)) setPrecio(sugerido(tipo, l))
  }

  const esCredito = pago === 'credito'
  const pideFoto = pago === 'tarjeta' || pago === 'transferencia'
  const faltan: string[] = []
  if (modo === 'noche' && !huesped.trim()) faltan.push('el nombre')
  if (modo === 'noche' && !pago) faltan.push('la forma de pago')
  if (esCredito && !empresa.trim()) faltan.push('la empresa')
  if (modo === 'noche' && !esCredito && pago && pago !== 'pendiente' && precio == null) faltan.push('el precio')

  async function guardar() {
    setOcupado(true)
    setError(null)
    const cuerpo: Record<string, unknown> = {
      modo,
      huesped: huesped.trim() || (modo === 'hora' ? 'Por hora' : ''),
      empresa: empresa.trim(),
      tipo,
      pago: !pago || pago === 'pendiente' ? null : pago,
      precio: modo === 'hora' ? precioHora : esCredito ? null : precio,
      larga: modo === 'noche' && larga,
      nota,
      foto_id: fotoId,
    }
    if (!empresa.trim()) cuerpo.empresa_id = null
    try {
      if (registro) {
        const { modo: _m, ...cambios } = cuerpo
        await api(`/registros/${registro.id}`, { method: 'PATCH', json: cambios })
      } else {
        await api(`/hostales/${hostalId}/registros`, { method: 'POST', json: { ...cuerpo, habitacion: hab.numero, ...(fecha && usuario?.rol === 'dueno' ? { fecha } : {}) } })
      }
      await despuesDeGuardar(registro ? 'Cambios guardados' : modo === 'hora' ? `Hab. ${hab.numero}: por hora` : `Hab. ${hab.numero}: ${cuerpo.huesped}`)
      onListo()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setOcupado(false)
    }
  }

  async function elegirFoto(f: File | undefined) {
    if (!f) return
    setSubiendo(true)
    setError(null)
    try {
      setFotoId(await subirFoto(hostalId, 'voucher', f))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSubiendo(false)
      if (archivo.current) archivo.current.value = ''
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (!faltan.length) void guardar()
      }}
    >
      {!editando && (
        <div className="campo">
          <Opciones<'noche' | 'hora'>
            valor={modo}
            columnas="dos"
            etiqueta="Modo"
            opciones={[
              { valor: 'noche', texto: 'Por noche', detalle: `Sale ${horaBonita(hostal.hora_salida)}` },
              { valor: 'hora', texto: 'Por hora', detalle: 'Salida a mano' },
            ]}
            onCambio={setModo}
          />
        </div>
      )}

      <label className="campo" htmlFor="huesped">
        <span>Huésped{modo === 'hora' ? ' (opcional)' : ''}</span>
        <Autocompletar
          id="huesped"
          valor={huesped}
          onCambio={setHuesped}
          sugerencias={sugHuespedes}
          mayusculas
          autoFocus={!editando}
          placeholder="Nombre y apellido"
          onElegir={(s) => {
            const x = s.datos as Sugerencias['huespedes'][number]
            if (x?.empresa && !empresa) setEmpresa(x.empresa)
            if (x?.tipo) cambiarTipo(x.tipo)
          }}
        />
      </label>

      <label className="campo" htmlFor="empresa">
        <span>Empresa {esCredito ? '' : '(opcional)'}</span>
        <Autocompletar id="empresa" valor={empresa} onCambio={setEmpresa} sugerencias={sugEmpresas} placeholder="Ej. Emsula, Grupo Comidas" />
      </label>

      <div className="campo">
        <span>Tipo de habitación</span>
        <Opciones<TipoHabitacion> valor={tipo} columnas="tres" opciones={TIPOS.map((t) => ({ valor: t, texto: t, detalle: lempiras(precioLista(hostal, t)) }))} onCambio={cambiarTipo} />
      </div>

      <div className="campo">
        <span>Forma de pago{modo === 'hora' ? ' (o al cerrar)' : ''}</span>
        <Opciones<PagoOpcion>
          valor={pago}
          opciones={[...PAGOS.map((p) => ({ valor: p as PagoOpcion, texto: NOMBRE_PAGO[p] })), { valor: 'pendiente', texto: 'Pendiente', detalle: 'Cobrar después' }]}
          onCambio={setPago}
        />
      </div>

      {modo === 'hora' ? (
        <div className="campo">
          <span>Precio por hora (opcional, se puede poner al cerrar)</span>
          <CampoMonto valor={precioHora} onCambio={setPrecioHora} placeholder="Escribe el monto" />
        </div>
      ) : esCredito ? (
        <p className="banda info">
          <span>
            <b>Crédito:</b> se valora con el precio de lista, {lempiras(precioLista(hostal, tipo))}.
          </span>
        </p>
      ) : (
        <div className="campo">
          <span>Precio de la noche</span>
          <CampoMonto
            valor={precio}
            onCambio={(v) => {
              precioTocado.current = true
              setPrecio(v)
            }}
          />
          <label className="casilla">
            <input type="checkbox" checked={larga} onChange={(e) => cambiarLarga(e.target.checked)} />
            <span>
              Estadía de más de un mes <span className="muted">(−{lempiras(hostal.descuento_larga)} por noche)</span>
            </span>
          </label>
        </div>
      )}

      {pideFoto && (
        <div className="campo">
          <span>Foto del {pago === 'tarjeta' ? 'voucher' : 'comprobante'} (opcional)</span>
          <input ref={archivo} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void elegirFoto(e.target.files?.[0])} />
          <div className="acciones" style={{ alignItems: 'center' }}>
            <button type="button" className="btn" disabled={subiendo} onClick={() => archivo.current?.click()}>
              <Icono nombre="camara" tam={18} /> {subiendo ? 'Subiendo…' : fotoId ? 'Cambiar foto' : 'Tomar foto'}
            </button>
            {fotoId && <span className="chip">✓ Foto guardada</span>}
          </div>
        </div>
      )}

      <label className="campo">
        <span>Nota (opcional)</span>
        <input className="entrada" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej. llega tarde, pidió toalla extra" />
      </label>

      {error && <p className="banda rojo" style={{ marginTop: 0 }}>{error}</p>}
      <div className="hoja-pie">
        <button type="submit" className="btn primario grande ancho" disabled={ocupado || subiendo || faltan.length > 0}>
          {ocupado ? 'Guardando…' : faltan.length ? `Falta ${faltan.join(', ')}` : editando ? 'Guardar cambios' : modo === 'hora' ? 'Empezar por hora' : 'Registrar huésped'}
        </button>
      </div>
    </form>
  )
}
