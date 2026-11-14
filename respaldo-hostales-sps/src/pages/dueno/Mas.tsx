import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { esHora, fechaCorta, horaHN, partesHN } from '../../../shared/fechas'
import { NOMBRE_TURNO, TIPOS, normalizar, type Ajustes, type Empresa, type Hostal, type Tarea, type TipoHabitacion } from '../../../shared/reglas'
import { api } from '../../lib/api'
import { lempiras } from '../../lib/formato'
import { useAviso, useCarga } from '../../lib/hooks'
import { useSesion } from '../../lib/sesion'
import { AvisoFlotante, CampoMonto, Cargando, Hoja, Opciones } from '../../components/ui'
export { default as Importar } from './Importar'

const ENLACES = [
  { to: '/tareas', texto: 'Tareas', detalle: 'Asignar tareas a recepción y ver las pendientes' },
  { to: '/historial', texto: 'Historial', detalle: 'Quién cambió qué y cuándo' },
  { to: '/empresas', texto: 'Empresas', detalle: 'Agregar, editar, alias (Pepsi = Emsula) y unir duplicadas' },
  { to: '/personal', texto: 'Personal', detalle: 'Recepcionistas, PIN y hostal de cada uno' },
  { to: '/hostales', texto: 'Hostales y precios', detalle: 'Precios de lista, por hora, horarios y habitaciones' },
  { to: '/ajustes', texto: 'Permisos y bloqueo', detalle: 'Qué ve recepción, bloqueo por inactividad, cuentas de banco' },
  { to: '/importar', texto: 'Importar CSV', detalle: 'Cargar los reportes de papel (fecha, habitación, huésped…)' },
]

export function Mas() {
  return (
    <div className="tarjeta">
      <ul className="lista">
        {ENLACES.map((e) => (
          <li key={e.to}>
            <Link to={e.to} style={{ color: 'inherit', textDecoration: 'none', flex: 1, padding: '4px 0' }}>
              <b style={{ fontSize: '1.05rem' }}>{e.texto}</b>
              <br />
              <span className="muted peq">{e.detalle}</span>
            </Link>
            <span className="muted">›</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Volver() {
  return (
    <Link to="/mas" className="btn chico fantasma" style={{ marginBottom: 12 }}>
      ‹ Más
    </Link>
  )
}

function useAccion(recargar?: () => Promise<void>) {
  const { aviso, mostrar } = useAviso()
  const [ocupado, setOcupado] = useState(false)
  const correr = async (fn: () => Promise<unknown>, texto: string) => {
    setOcupado(true)
    try {
      await fn()
      mostrar(texto)
      await recargar?.()
      return true
    } catch (e) {
      mostrar((e as Error).message, 'error')
      return false
    } finally {
      setOcupado(false)
    }
  }
  return { aviso, ocupado, correr, mostrar }
}

interface Config {
  hostales: Hostal[]
  ajustes: Ajustes
  usuarios: { id: string; nombre: string; rol: 'dueno' | 'recepcion'; hostal_id: string | null; activo: boolean; bloqueado_hasta: number | null }[]
}

// ---------------------------------------------------------------- Tareas

export function TareasDueno() {
  const { hostales } = useSesion()
  const [hostal, setHostal] = useState(hostales[0]?.id ?? '')
  const { datos, recargar } = useCarga<{ tareas: Tarea[] }>(`/hostales/${hostal}/tareas`)
  const config = useCarga<Config>('/config')
  const { aviso, ocupado, correr } = useAccion(recargar)
  const [texto, setTexto] = useState('')
  const [para, setPara] = useState('')
  const [turno, setTurno] = useState<'cualquiera' | 'dia' | 'noche'>('cualquiera')
  const recepcionistas = config.datos?.usuarios.filter((u) => u.rol === 'recepcion' && u.activo && u.hostal_id === hostal) ?? []
  const pendientes = datos?.tareas.filter((t) => !t.hecha_en) ?? []
  const hechas = datos?.tareas.filter((t) => t.hecha_en) ?? []

  return (
    <>
      <Volver />
      <div className="segmentos">
        {hostales.map((h) => (
          <button key={h.id} type="button" aria-pressed={hostal === h.id} onClick={() => setHostal(h.id)}>
            {h.nombre.replace(/^Hostal /, '')}
          </button>
        ))}
      </div>
      <form
        className="tarjeta"
        onSubmit={async (e) => {
          e.preventDefault()
          const ok = await correr(
            () => api(`/hostales/${hostal}/tareas`, { method: 'POST', json: { texto, usuario_id: para || null, turno: turno === 'cualquiera' ? null : turno } }),
            'Tarea asignada',
          )
          if (ok) setTexto('')
        }}
      >
        <h2 style={{ marginBottom: 12 }}>Nueva tarea</h2>
        <label className="campo">
          <span>Tarea</span>
          <input className="entrada" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Ej. cobrar a Emsula, revisar hab. 6" />
        </label>
        <label className="campo">
          <span>Para</span>
          <select className="entrada" value={para} onChange={(e) => setPara(e.target.value)}>
            <option value="">Cualquier recepcionista</option>
            {recepcionistas.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nombre}
              </option>
            ))}
          </select>
        </label>
        <div className="campo">
          <span>Turno</span>
          <Opciones
            valor={turno}
            columnas="tres"
            opciones={[
              { valor: 'cualquiera', texto: 'Cualquiera' },
              { valor: 'dia', texto: 'Día' },
              { valor: 'noche', texto: 'Noche' },
            ]}
            onCambio={setTurno}
          />
        </div>
        <button type="submit" className="btn primario ancho" disabled={ocupado || !texto.trim()}>
          Asignar tarea
        </button>
      </form>

      <div className="tarjeta">
        <div className="tarjeta-cabeza">
          <h2>Pendientes</h2>
          <span className="muted">{pendientes.length}</span>
        </div>
        {!datos ? (
          <Cargando />
        ) : pendientes.length === 0 ? (
          <p className="vacio">No hay tareas pendientes.</p>
        ) : (
          <ul className="lista">
            {pendientes.map((t) => (
              <li key={t.id}>
                <span>
                  <b>{t.texto}</b>
                  <br />
                  <span className="muted peq">
                    {t.usuario ?? 'Cualquiera'} · {t.turno ? `turno de ${NOMBRE_TURNO[t.turno].toLowerCase()}` : 'cualquier turno'} · asignada {fechaCorta(partesHN(t.creada_en).fecha, false)}
                  </span>
                </span>
                <button type="button" className="btn chico fantasma" onClick={() => void correr(() => api(`/tareas/${t.id}`, { method: 'DELETE' }), 'Tarea borrada')}>
                  Borrar
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {hechas.length > 0 && (
        <div className="tarjeta">
          <h2 style={{ marginBottom: 8 }}>Hechas (última semana)</h2>
          <ul className="lista">
            {hechas.map((t) => (
              <li key={t.id}>
                <span>
                  {t.texto}
                  <br />
                  <span className="muted peq">
                    {t.hecha_por_nombre} · {fechaCorta(partesHN(t.hecha_en!).fecha, false)} {horaHN(t.hecha_en!)}
                  </span>
                </span>
                <span style={{ color: 'var(--ok)' }}>✓</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <AvisoFlotante aviso={aviso} />
    </>
  )
}

// ---------------------------------------------------------------- Historial

interface Evento {
  id: number
  hostal_id: string | null
  usuario_nombre: string
  accion: string
  entidad: string
  entidad_id: string | null
  detalle: Record<string, any>
  creado_en: number
}

function resumirDetalle(e: Evento) {
  const d = e.detalle ?? {}
  const partes: string[] = []
  if (d.habitacion) partes.push(`hab. ${d.habitacion}`)
  if (d.huesped) partes.push(d.huesped)
  if (d.fecha && typeof d.fecha === 'string') partes.push(`noche ${fechaCorta(d.fecha, false)}`)
  if (d.cambios) {
    for (const [k, v] of Object.entries(d.cambios as Record<string, { antes: unknown; despues: unknown }>)) {
      const f = (x: unknown) => (k === 'precio' && typeof x === 'number' ? lempiras(x) : x == null || x === '' ? '—' : String(x))
      partes.push(`${k}: ${f(v.antes)} → ${f(v.despues)}`)
    }
  }
  if (d.motivo) partes.push(`motivo: ${d.motivo}`)
  if (d.texto) partes.push(d.texto)
  if (d.nombre && !d.huesped) partes.push(d.nombre)
  if (d.copiados) partes.push(`${d.copiados.length} copiados`)
  if (d.importadas != null) partes.push(`${d.importadas} filas importadas`)
  if (d.movimientos?.length) partes.push(`efectivo: ${d.movimientos.map((m: { tipo: string; monto: number }) => `${m.tipo} ${lempiras(m.monto)}`).join(', ')}`)
  if (d.sin_pago?.length) partes.push(`sin pago: ${d.sin_pago.join(', ')}`)
  if (d.unida) partes.push(`${d.unida} → ${d.queda}`)
  return partes.join(' · ')
}

export function Historial() {
  const { hostales } = useSesion()
  const [hostal, setHostal] = useState('')
  const [eventos, setEventos] = useState<Evento[]>([])
  const [antes, setAntes] = useState<number | null>(null)
  const ruta = `/historial?limite=100${hostal ? `&hostal=${hostal}` : ''}`
  const { datos } = useCarga<{ eventos: Evento[] }>(ruta)
  const lista = antes ? eventos : (datos?.eventos ?? [])
  const nombreHostal = (id: string | null) => (id ? (hostales.find((h) => h.id === id)?.nombre.replace(/^Hostal /, '') ?? id) : 'General')

  async function masAntiguos() {
    const ultimo = lista.at(-1)
    if (!ultimo) return
    const r = await api<{ eventos: Evento[] }>(`${ruta}&antes=${ultimo.id}`)
    setEventos([...lista, ...r.eventos])
    setAntes(ultimo.id)
  }

  return (
    <>
      <Volver />
      <div className="segmentos">
        {[{ id: '', nombre: 'Todos' }, ...hostales].map((h) => (
          <button
            key={h.id}
            type="button"
            aria-pressed={hostal === h.id}
            onClick={() => {
              setHostal(h.id)
              setAntes(null)
              setEventos([])
            }}
          >
            {h.nombre.replace(/^Hostal /, '')}
          </button>
        ))}
      </div>
      <div className="tarjeta">
        {!datos ? (
          <Cargando />
        ) : lista.length === 0 ? (
          <p className="vacio">Todavía no hay cambios.</p>
        ) : (
          <ul className="lista">
            {lista.map((e) => (
              <li key={e.id} style={{ alignItems: 'flex-start' }}>
                <span style={{ flex: 1 }}>
                  <b>{e.usuario_nombre || 'Sistema'}</b> {e.accion}
                  <br />
                  <span className="muted peq">{resumirDetalle(e)}</span>
                </span>
                <span className="muted peq" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {fechaCorta(partesHN(e.creado_en).fecha, false)} {horaHN(e.creado_en)}
                  <br />
                  {nombreHostal(e.hostal_id)}
                </span>
              </li>
            ))}
          </ul>
        )}
        {lista.length >= 100 && (
          <button type="button" className="btn ancho" style={{ marginTop: 10 }} onClick={() => void masAntiguos()}>
            Ver más antiguos
          </button>
        )}
      </div>
    </>
  )
}

// ---------------------------------------------------------------- Empresas

export function Empresas() {
  const { datos, recargar } = useCarga<{ empresas: Empresa[] }>('/empresas')
  const { aviso, ocupado, correr } = useAccion(recargar)
  const [editar, setEditar] = useState<Empresa | 'nueva' | null>(null)
  const [unir, setUnir] = useState<Empresa | null>(null)
  const [buscar, setBuscar] = useState('')
  const lista = (datos?.empresas ?? []).filter((e) => !buscar || normalizar([e.nombre, ...e.alias].join(' ')).includes(normalizar(buscar)))
  return (
    <>
      <Volver />
      <div className="acciones" style={{ marginBottom: 12 }}>
        <input className="entrada" style={{ flex: 1 }} placeholder="Buscar empresa" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
        <button type="button" className="btn primario" onClick={() => setEditar('nueva')}>
          + Empresa
        </button>
      </div>
      <div className="tarjeta">
        {!datos ? (
          <Cargando />
        ) : (
          <ul className="lista">
            {lista.map((e) => (
              <li key={e.id}>
                <span style={{ flex: 1, opacity: e.activa ? 1 : 0.55 }}>
                  <b>{e.nombre}</b> {!e.activa && <span className="insignia neutra">Inactiva</span>}
                  <br />
                  <span className="muted peq">
                    {e.noches ?? 0} registros{e.alias.length ? ` · también: ${e.alias.join(', ')}` : ''}
                  </span>
                </span>
                <span className="acciones">
                  <button type="button" className="btn chico" onClick={() => setEditar(e)}>
                    Editar
                  </button>
                  <button type="button" className="btn chico" onClick={() => setUnir(e)}>
                    Unir
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {editar && (
        <HojaEmpresa
          empresa={editar === 'nueva' ? null : editar}
          ocupado={ocupado}
          onCerrar={() => setEditar(null)}
          onGuardar={async (cuerpo) => {
            const ok = await correr(
              () => (editar === 'nueva' ? api('/empresas', { method: 'POST', json: cuerpo }) : api(`/empresas/${editar.id}`, { method: 'PATCH', json: cuerpo })),
              'Empresa guardada',
            )
            if (ok) setEditar(null)
          }}
        />
      )}
      {unir && datos && (
        <Hoja titulo={`Unir con ${unir.nombre}`} subtitulo="Elige la empresa duplicada: sus noches y facturas pasan a esta y su nombre queda como alias." onCerrar={() => setUnir(null)}>
          <ul className="lista">
            {datos.empresas
              .filter((e) => e.id !== unir.id)
              .map((e) => (
                <li key={e.id}>
                  <span>
                    <b>{e.nombre}</b>
                    <br />
                    <span className="muted peq">{e.noches ?? 0} registros</span>
                  </span>
                  <button
                    type="button"
                    className="btn chico peligro"
                    disabled={ocupado}
                    onClick={async () => {
                      if (!confirm(`¿Unir «${e.nombre}» dentro de «${unir.nombre}»? No se puede deshacer.`)) return
                      const ok = await correr(() => api(`/empresas/${unir.id}/unir`, { method: 'POST', json: { de: e.id } }), `${e.nombre} unida a ${unir.nombre}`)
                      if (ok) setUnir(null)
                    }}
                  >
                    Unir aquí
                  </button>
                </li>
              ))}
          </ul>
        </Hoja>
      )}
      <AvisoFlotante aviso={aviso} />
    </>
  )
}

function HojaEmpresa({ empresa, ocupado, onCerrar, onGuardar }: { empresa: Empresa | null; ocupado: boolean; onCerrar: () => void; onGuardar: (c: { nombre: string; alias: string[]; activa: boolean }) => void }) {
  const [nombre, setNombre] = useState(empresa?.nombre ?? '')
  const [alias, setAlias] = useState(empresa?.alias.join(', ') ?? '')
  const [activa, setActiva] = useState(empresa?.activa ?? true)
  return (
    <Hoja titulo={empresa ? 'Editar empresa' : 'Nueva empresa'} onCerrar={onCerrar}>
      <label className="campo">
        <span>Nombre</span>
        <input className="entrada" value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus />
      </label>
      <label className="campo">
        <span>También aparece como (separado por comas)</span>
        <input className="entrada" value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="Ej. Pepsi" />
      </label>
      {empresa && (
        <label className="casilla">
          <input type="checkbox" checked={activa} onChange={(e) => setActiva(e.target.checked)} />
          <span>Activa (aparece al registrar)</span>
        </label>
      )}
      <button type="button" className="btn primario grande ancho" style={{ marginTop: 12 }} disabled={ocupado || !nombre.trim()} onClick={() => onGuardar({ nombre, alias: alias.split(',').map((a) => a.trim()).filter(Boolean), activa })}>
        Guardar
      </button>
    </Hoja>
  )
}

// ---------------------------------------------------------------- Personal

export function Personal() {
  const { datos, recargar } = useCarga<Config>('/config')
  const { aviso, ocupado, correr } = useAccion(recargar)
  const [editar, setEditar] = useState<Config['usuarios'][number] | 'nuevo' | null>(null)
  if (!datos) return <Cargando />
  return (
    <>
      <Volver />
      {datos.hostales.map((h) => {
        const gente = datos.usuarios.filter((u) => u.rol === 'recepcion' && u.hostal_id === h.id)
        return (
          <div key={h.id} className="tarjeta">
            <div className="tarjeta-cabeza">
              <h2>{h.nombre}</h2>
              <span className="muted">{gente.filter((u) => u.activo).length} activos</span>
            </div>
            {gente.length === 0 ? (
              <p className="muted">Sin recepcionistas.</p>
            ) : (
              <ul className="lista">
                {gente.map((u) => (
                  <li key={u.id}>
                    <span style={{ opacity: u.activo ? 1 : 0.55 }}>
                      <b>{u.nombre}</b> {!u.activo && <span className="insignia neutra">Desactivado</span>}
                      {u.bloqueado_hasta && u.bloqueado_hasta > Date.now() && <span className="insignia roja">Bloqueado por PIN</span>}
                    </span>
                    <button type="button" className="btn chico" onClick={() => setEditar(u)}>
                      Editar
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )
      })}
      <button type="button" className="btn primario grande ancho" style={{ marginTop: 14 }} onClick={() => setEditar('nuevo')}>
        + Agregar recepcionista
      </button>
      {editar && (
        <HojaPersona
          persona={editar === 'nuevo' ? null : editar}
          hostales={datos.hostales}
          ocupado={ocupado}
          onCerrar={() => setEditar(null)}
          onGuardar={async (cuerpo) => {
            const ok = await correr(
              () => (editar === 'nuevo' ? api('/usuarios', { method: 'POST', json: cuerpo }) : api(`/usuarios/${editar.id}`, { method: 'PATCH', json: cuerpo })),
              editar === 'nuevo' ? 'Recepcionista agregado' : 'Cambios guardados',
            )
            if (ok) setEditar(null)
          }}
        />
      )}
      <AvisoFlotante aviso={aviso} />
    </>
  )
}

function HojaPersona({
  persona,
  hostales,
  ocupado,
  onCerrar,
  onGuardar,
}: {
  persona: Config['usuarios'][number] | null
  hostales: Hostal[]
  ocupado: boolean
  onCerrar: () => void
  onGuardar: (c: Record<string, unknown>) => void
}) {
  const [nombre, setNombre] = useState(persona?.nombre ?? '')
  const [hostal, setHostal] = useState(persona?.hostal_id ?? hostales[0]?.id ?? '')
  const [pin, setPin] = useState('')
  const [activo, setActivo] = useState(persona?.activo ?? true)
  const pinValido = /^\d{4,8}$/.test(pin)
  return (
    <Hoja titulo={persona ? persona.nombre : 'Nuevo recepcionista'} onCerrar={onCerrar}>
      <label className="campo">
        <span>Nombre (así aparece al entrar)</span>
        <input className="entrada" value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus={!persona} />
      </label>
      <div className="campo">
        <span>Hostal</span>
        <Opciones valor={hostal} columnas="dos" opciones={hostales.map((h) => ({ valor: h.id, texto: h.nombre.replace(/^Hostal /, '') }))} onCambio={setHostal} />
      </div>
      <label className="campo">
        <span>{persona ? 'PIN nuevo (déjalo vacío para no cambiarlo)' : 'PIN (4 a 8 números)'}</span>
        <input className="entrada mono" inputMode="numeric" maxLength={8} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
      </label>
      {persona && (
        <label className="casilla">
          <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
          <span>Activo (puede entrar)</span>
        </label>
      )}
      <button
        type="button"
        className="btn primario grande ancho"
        style={{ marginTop: 12 }}
        disabled={ocupado || !nombre.trim() || (persona ? Boolean(pin) && !pinValido : !pinValido)}
        onClick={() => onGuardar({ nombre, hostal_id: hostal, ...(pin ? { pin } : {}), ...(persona ? { activo } : {}) })}
      >
        Guardar
      </button>
    </Hoja>
  )
}

// ---------------------------------------------------------------- Hostales y precios

export function Hostales() {
  const { recargar: recargarSesion } = useSesion()
  const { datos, recargar } = useCarga<Config>('/config')
  const { aviso, ocupado, correr } = useAccion(async () => {
    await recargar()
    await recargarSesion()
  })
  if (!datos) return <Cargando />
  return (
    <>
      <Volver />
      {datos.hostales.map((h) => (
        <FormHostal key={h.id + h.version} h={h} ocupado={ocupado} correr={correr} />
      ))}
      <AvisoFlotante aviso={aviso} />
    </>
  )
}

function FormHostal({ h, ocupado, correr }: { h: Hostal; ocupado: boolean; correr: (fn: () => Promise<unknown>, texto: string) => Promise<boolean> }) {
  const [nombre, setNombre] = useState(h.nombre)
  const [precios, setPrecios] = useState({ precio_sencilla: h.precio_sencilla, precio_doble: h.precio_doble, precio_triple: h.precio_triple })
  const [precioHora, setPrecioHora] = useState<number | null>(h.precio_hora)
  const [descuento, setDescuento] = useState<number | null>(h.descuento_larga)
  const [horas, setHoras] = useState({ hora_dia: h.hora_dia, hora_noche: h.hora_noche, hora_salida: h.hora_salida })
  const [habs, setHabs] = useState(h.habitaciones.map((x) => ({ numero: x.numero, tipo: x.tipo, activa: x.activa })))
  const [nueva, setNueva] = useState('')
  const horasOk = Object.values(horas).every(esHora)
  return (
    <div className="tarjeta">
      <h2 style={{ marginBottom: 14 }}>{h.nombre}</h2>
      <label className="campo">
        <span>Nombre</span>
        <input className="entrada" value={nombre} onChange={(e) => setNombre(e.target.value)} />
      </label>
      <div className="rejilla-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
        {TIPOS.map((t) => {
          const k = `precio_${t.toLowerCase()}` as keyof typeof precios
          return (
            <label key={t} className="campo">
              <span>{t}</span>
              <CampoMonto valor={precios[k]} onCambio={(v) => setPrecios((p) => ({ ...p, [k]: v ?? 0 }))} />
            </label>
          )
        })}
        <label className="campo">
          <span>Por hora (sugerido)</span>
          <CampoMonto valor={precioHora} onCambio={setPrecioHora} placeholder="Lo escribe recepción" />
        </label>
        <label className="campo">
          <span>Descuento estadía larga (por noche)</span>
          <CampoMonto valor={descuento} onCambio={setDescuento} />
        </label>
      </div>
      <div className="rejilla-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
        {(
          [
            ['hora_dia', 'Empieza turno de día'],
            ['hora_noche', 'Empieza turno de noche'],
            ['hora_salida', 'Salida automática'],
          ] as const
        ).map(([k, texto]) => (
          <label key={k} className="campo">
            <span>{texto}</span>
            <input className="entrada" type="time" value={horas[k]} onChange={(e) => setHoras((x) => ({ ...x, [k]: e.target.value }))} />
          </label>
        ))}
      </div>
      <p className="muted peq" style={{ marginTop: -6 }}>
        El día de trabajo cambia cuando empieza el turno de día. Los precios ya incluyen ISV 15 % y turismo 4 %.
      </p>
      <button
        type="button"
        className="btn primario ancho"
        disabled={ocupado || !horasOk}
        onClick={() => void correr(() => api(`/hostales/${h.id}`, { method: 'PATCH', json: { nombre, ...precios, precio_hora: precioHora, descuento_larga: descuento ?? 0, ...horas } }), 'Hostal guardado')}
      >
        Guardar precios y horarios
      </button>

      <h2 style={{ margin: '24px 0 6px' }}>Habitaciones</h2>
      <p className="muted peq" style={{ marginTop: 0 }}>
        El tipo es el que se sugiere al registrar (recepción lo puede cambiar).
      </p>
      <ul className="lista">
        {habs.map((x, i) => (
          <li key={x.numero} style={{ flexWrap: 'wrap' }}>
            <b className="mono" style={{ width: 44, opacity: x.activa ? 1 : 0.5 }}>
              {x.numero}
            </b>
            <select className="entrada" style={{ flex: '1 1 140px', minHeight: 44 }} value={x.tipo} onChange={(e) => setHabs((hs) => hs.map((y, j) => (j === i ? { ...y, tipo: e.target.value as TipoHabitacion } : y)))}>
              {TIPOS.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
            <label className="casilla" style={{ minHeight: 44 }}>
              <input type="checkbox" checked={x.activa} onChange={(e) => setHabs((hs) => hs.map((y, j) => (j === i ? { ...y, activa: e.target.checked } : y)))} />
              <span className="peq">Activa</span>
            </label>
          </li>
        ))}
      </ul>
      <div className="acciones" style={{ marginTop: 10 }}>
        <input className="entrada" style={{ flex: 1 }} placeholder="Nueva habitación (número)" value={nueva} onChange={(e) => setNueva(e.target.value)} />
        <button
          type="button"
          className="btn"
          disabled={!nueva.trim() || habs.some((x) => x.numero.toUpperCase() === nueva.trim().toUpperCase())}
          onClick={() => {
            setHabs((hs) => [...hs, { numero: nueva.trim().toUpperCase(), tipo: 'Sencilla', activa: true }])
            setNueva('')
          }}
        >
          Agregar
        </button>
      </div>
      <button type="button" className="btn ancho" style={{ marginTop: 12 }} disabled={ocupado} onClick={() => void correr(() => api(`/hostales/${h.id}/habitaciones`, { method: 'PUT', json: { habitaciones: habs } }), 'Habitaciones guardadas')}>
        Guardar habitaciones
      </button>
    </div>
  )
}

// ---------------------------------------------------------------- Ajustes

export function AjustesPagina() {
  const { recargar: recargarSesion } = useSesion()
  const { datos, recargar } = useCarga<Config>('/config')
  const { aviso, ocupado, correr } = useAccion(async () => {
    await recargar()
    await recargarSesion()
  })
  const [cuenta, setCuenta] = useState('')
  const a = datos?.ajustes
  const guardar = (cambios: Partial<Ajustes>) => void correr(() => api('/ajustes', { method: 'PATCH', json: cambios }), 'Ajustes guardados')
  const minutos = useMemo(() => [0, 2, 5, 10, 15, 30, 60], [])
  if (!a) return <Cargando />
  return (
    <>
      <Volver />
      <div className="tarjeta">
        <h2 style={{ marginBottom: 8 }}>Qué ve recepción</h2>
        <label className="casilla">
          <input type="checkbox" checked={a.recepcion_ve_totales} disabled={ocupado} onChange={(e) => guardar({ recepcion_ve_totales: e.target.checked })} />
          <span>
            Ve los totales del día y de su turno <span className="muted peq">(caja de hoy, efectivo esperado al cerrar)</span>
          </span>
        </label>
        <label className="casilla">
          <input type="checkbox" checked={a.recepcion_ve_mes} disabled={ocupado} onChange={(e) => guardar({ recepcion_ve_mes: e.target.checked })} />
          <span>
            Ve el mes de su hostal <span className="muted peq">(ocupación, calendario e ingresos)</span>
          </span>
        </label>
      </div>
      <div className="tarjeta">
        <h2 style={{ marginBottom: 8 }}>Bloqueo por inactividad</h2>
        <p className="muted peq" style={{ marginTop: 0 }}>
          Después de este tiempo sin tocar la pantalla, la app pide el PIN otra vez.
        </p>
        <Opciones<string> valor={String(a.bloqueo_minutos)} opciones={minutos.map((m) => ({ valor: String(m), texto: m ? `${m} min` : 'Nunca' }))} onCambio={(v) => guardar({ bloqueo_minutos: Number(v) })} />
      </div>
      <div className="tarjeta">
        <h2 style={{ marginBottom: 8 }}>Cuentas para depósitos</h2>
        <p className="muted peq" style={{ marginTop: 0 }}>
          Aparecen como opciones al cerrar el turno.
        </p>
        <ul className="lista">
          {a.cuentas_banco.map((c) => (
            <li key={c}>
              <span>{c}</span>
              <button type="button" className="btn chico fantasma" onClick={() => guardar({ cuentas_banco: a.cuentas_banco.filter((x) => x !== c) })}>
                Quitar
              </button>
            </li>
          ))}
        </ul>
        <div className="acciones" style={{ marginTop: 8 }}>
          <input className="entrada" style={{ flex: 1 }} placeholder="Ej. BAC 7300-1234" value={cuenta} onChange={(e) => setCuenta(e.target.value)} />
          <button
            type="button"
            className="btn"
            disabled={!cuenta.trim()}
            onClick={() => {
              guardar({ cuentas_banco: [...a.cuentas_banco, cuenta.trim()] })
              setCuenta('')
            }}
          >
            Agregar
          </button>
        </div>
      </div>
      <AvisoFlotante aviso={aviso} />
    </>
  )
}
