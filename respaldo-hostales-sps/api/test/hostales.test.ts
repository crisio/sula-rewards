import { env } from 'cloudflare:test'
import { beforeAll, describe, expect, it } from 'vitest'
import { call, entrarDueno, hoy, recepcionista, registrar, reloj } from './helpers'

let dueno: string

beforeAll(async () => {
  reloj('2026-11-01', '09:00')
  dueno = await entrarDueno()
})

describe('entrar con PIN', () => {
  it('el dueño entra con PIN_DUENO la primera vez; después con su PIN', async () => {
    const inicio = await call('/api/inicio')
    expect(inicio.data.dueno_configurado).toBe(true)
    expect(inicio.data.hostales.map((h: any) => h.id)).toEqual(['prado-alto', 'prokinto'])
    const yo = await call('/api/yo', { token: dueno })
    expect(yo.data.usuario.rol).toBe('dueno')
    expect(yo.data.hostales).toHaveLength(2)
    expect(yo.data.hostales[1].habitaciones.map((h: any) => h.numero)).toEqual(['501', '502', '503', '504', '505', '506', '507', '508', '509', '510', '511', '2C'])
  })

  it('bloquea después de 5 PIN incorrectos', async () => {
    const r = await recepcionista(dueno, 'prado-alto', 'Bloqueada')
    for (let i = 0; i < 4; i++) expect((await call('/api/entrar', { method: 'POST', json: { usuario_id: r.id, pin: '9999' } })).status).toBe(401)
    expect((await call('/api/entrar', { method: 'POST', json: { usuario_id: r.id, pin: '9999' } })).status).toBe(429)
    // Ni con el PIN correcto mientras dura el bloqueo
    expect((await call('/api/entrar', { method: 'POST', json: { usuario_id: r.id, pin: '1234' } })).status).toBe(429)
  })

  it('recepción solo ve su hostal y no ve el mes ni la configuración', async () => {
    const r = await recepcionista(dueno, 'prado-alto')
    expect((await hoy(r.token)).status).toBe(200)
    expect((await hoy(r.token, 'prokinto')).status).toBe(403)
    expect((await call('/api/hostales/prado-alto/mes?mes=2026-11', { token: r.token })).status).toBe(403)
    expect((await call('/api/config', { token: r.token })).status).toBe(403)
    expect((await call('/api/creditos', { token: r.token })).status).toBe(403)
    const yo = await call('/api/yo', { token: r.token })
    expect(yo.data.hostales.map((h: any) => h.id)).toEqual(['prado-alto'])
  })
})

describe('registro diario', () => {
  it('la fecha la pone el servidor: a las 2 a.m. todavía es la noche de ayer', async () => {
    const r = await recepcionista(dueno)
    reloj('2026-11-03', '02:00')
    const a = await registrar(r.token, { habitacion: '1', huesped: 'juan  pérez', tipo: 'Sencilla', pago: 'efectivo', fecha: '2030-01-01' })
    expect(a.status).toBe(201)
    expect(a.data.fecha).toBe('2026-11-02')
    expect(a.data.huesped).toBe('Juan Pérez')
    expect(a.data.precio).toBe(140000)
    reloj('2026-11-03', '08:00')
    const b = await registrar(r.token, { habitacion: '2', huesped: 'Ana', tipo: 'Doble', precio: 160000, pago: 'tarjeta' })
    expect(b.data.fecha).toBe('2026-11-03')
    expect(b.data.precio).toBe(160000)
  })

  it('no deja dos huéspedes en la misma habitación la misma noche', async () => {
    const r = await recepcionista(dueno)
    reloj('2026-11-04', '15:00')
    expect((await registrar(r.token, { habitacion: '3', huesped: 'Primero', tipo: 'Sencilla', pago: 'efectivo' })).status).toBe(201)
    const otra = await registrar(r.token, { habitacion: '3', huesped: 'Segundo', tipo: 'Sencilla', pago: 'efectivo' })
    expect(otra.status).toBe(409)
    expect(otra.data.error).toContain('Primero')
  })

  it('crédito: pide empresa, reconoce «Pepsi» como Emsula y vale el precio de lista', async () => {
    const r = await recepcionista(dueno)
    reloj('2026-11-04', '16:00')
    expect((await registrar(r.token, { habitacion: '4', huesped: 'Carlos', tipo: 'Doble', pago: 'credito' })).status).toBe(400)
    const ok = await registrar(r.token, { habitacion: '4', huesped: 'Carlos', tipo: 'Doble', pago: 'credito', empresa: 'PEPSI', precio: 1 })
    expect(ok.status).toBe(201)
    expect(ok.data.empresa).toBe('Emsula')
    expect(ok.data.precio).toBe(170000)
  })

  it('copiar huéspedes de ayer, salida a las 11:30 y limpieza', async () => {
    const r = await recepcionista(dueno)
    reloj('2026-11-05', '20:00')
    const a = await registrar(r.token, { habitacion: '5', huesped: 'Grupo Uno', tipo: 'Triple', pago: 'efectivo', empresa: 'Grupo Comidas' })
    const b = await registrar(r.token, { habitacion: '6', huesped: 'Grupo Dos', tipo: 'Sencilla', pago: 'credito', empresa: 'Grupo Comidas' })
    await registrar(r.token, { habitacion: '7', huesped: 'Se va', tipo: 'Sencilla', pago: 'efectivo' })

    reloj('2026-11-06', '09:00')
    const manana = await hoy(r.token)
    expect(manana.data.fecha).toBe('2026-11-06')
    expect(manana.data.anoche.map((x: any) => x.habitacion).sort()).toEqual(['5', '6', '7'])

    const copia = await call('/api/hostales/prado-alto/copiar', { method: 'POST', token: r.token, json: { ids: [a.data.id, b.data.id] } })
    expect(copia.status).toBe(200)
    expect(copia.data.copiados).toHaveLength(2)
    const otraVez = await call('/api/hostales/prado-alto/copiar', { method: 'POST', token: r.token, json: { ids: [a.data.id] } })
    expect(otraVez.data.omitidos[0].motivo).toContain('ya está ocupada')

    const despues = await hoy(r.token)
    const h5 = despues.data.hoy.find((x: any) => x.habitacion === '5')
    const h6 = despues.data.hoy.find((x: any) => x.habitacion === '6')
    expect(h5.estadia_id).toBe(a.data.estadia_id)
    expect(h5.precio).toBe(200000)
    expect(h5.pago).toBeNull() // el efectivo de hoy se cobra hoy
    expect(h6.pago).toBe('credito') // el crédito sigue siendo crédito
    expect(h6.empresa).toBe('Grupo Comidas')

    // La 7 sale a las 11:30: pasa a limpieza y después a lista
    const { estadoHabitacion } = await import('../../shared/calculos')
    const hab7 = despues.data.hostal.habitaciones.find((x: any) => x.numero === '7')
    const datos = { fecha: despues.data.fecha, hoy: despues.data.hoy, ayer: despues.data.anoche }
    expect(estadoHabitacion(hab7, datos, despues.data.hostal, despues.data.ahora).estado).toBe('sale')
    reloj('2026-11-06', '11:31')
    const tarde = await hoy(r.token)
    const datos2 = { fecha: tarde.data.fecha, hoy: tarde.data.hoy, ayer: tarde.data.anoche }
    expect(estadoHabitacion(hab7, datos2, tarde.data.hostal, tarde.data.ahora).estado).toBe('limpieza')
    expect(estadoHabitacion(tarde.data.hostal.habitaciones.find((x: any) => x.numero === '5'), datos2, tarde.data.hostal, tarde.data.ahora).estado).toBe('ocupada')
    expect((await call('/api/hostales/prado-alto/habitaciones/7/lista', { method: 'POST', token: r.token })).status).toBe(200)
    const lista = await hoy(r.token)
    const hab7b = lista.data.hostal.habitaciones.find((x: any) => x.numero === '7')
    expect(estadoHabitacion(hab7b, { fecha: lista.data.fecha, hoy: lista.data.hoy, ayer: lista.data.anoche }, lista.data.hostal, lista.data.ahora).estado).toBe('libre')
  })

  it('por hora: bloquea la habitación hasta cerrarlo a mano', async () => {
    const r = await recepcionista(dueno)
    reloj('2026-11-07', '14:00')
    const h = await registrar(r.token, { habitacion: '8', modo: 'hora', tipo: 'Sencilla' })
    expect(h.status).toBe(201)
    expect(h.data.huesped).toBe('Por hora')
    expect(h.data.precio).toBeNull()
    expect((await registrar(r.token, { habitacion: '8', huesped: 'Noche', tipo: 'Sencilla', pago: 'efectivo' })).status).toBe(409)
    reloj('2026-11-07', '16:00')
    const cierre = await call(`/api/registros/${h.data.id}/salida`, { method: 'POST', token: r.token, json: { precio: 50000, pago: 'efectivo' } })
    expect(cierre.status).toBe(200)
    expect(cierre.data.salida_en).not.toBeNull()
    expect(cierre.data.precio).toBe(50000)
    expect((await registrar(r.token, { habitacion: '8', huesped: 'Noche', tipo: 'Sencilla', pago: 'efectivo' })).status).toBe(201)
  })
})

describe('correcciones', () => {
  it('registrar una noche pasada no marca la habitación como limpia; la de hoy sí', async () => {
    reloj('2026-11-10', '20:00')
    const antes = (await env.DB.prepare("SELECT limpia_en FROM habitaciones WHERE hostal_id = 'prado-alto' AND numero = '14'").first<{ limpia_en: number | null }>())?.limpia_en
    expect((await registrar(dueno, { habitacion: '14', huesped: 'Pasado', tipo: 'Sencilla', pago: 'efectivo', fecha: '2026-11-09' })).status).toBe(201)
    const despues = await env.DB.prepare("SELECT limpia_en FROM habitaciones WHERE hostal_id = 'prado-alto' AND numero = '14'").first<{ limpia_en: number | null }>()
    expect(despues?.limpia_en).toBe(antes ?? null)
    expect((await registrar(dueno, { habitacion: '14', huesped: 'Hoy', tipo: 'Sencilla', pago: 'efectivo' })).status).toBe(201)
    const hoyMismo = await env.DB.prepare("SELECT limpia_en FROM habitaciones WHERE hostal_id = 'prado-alto' AND numero = '14'").first<{ limpia_en: number | null }>()
    expect(hoyMismo?.limpia_en).toBeGreaterThan(0)
  })

  it('un alquiler por hora abierto no cuenta como «sin pago» al cerrar el turno', async () => {
    reloj('2026-11-10', '08:00')
    const r = await recepcionista(dueno, 'prokinto')
    const turno = (await call('/api/hostales/prokinto/turnos/actual', { method: 'POST', token: r.token, json: {} })).data.turno
    await registrar(r.token, { habitacion: '505', modo: 'hora', tipo: 'Sencilla' }, 'prokinto')
    const resumen = await call(`/api/turnos/${turno.id}`, { token: r.token })
    expect(resumen.data.sin_pago).toHaveLength(0)
    expect(resumen.data.horas_abiertas.map((x: any) => x.habitacion)).toContain('505')
    expect((await call(`/api/turnos/${turno.id}/cerrar`, { method: 'POST', token: r.token, json: {} })).status).toBe(200)
  })
})

describe('cierre de turno', () => {
  it('avisa si hay habitaciones sin pago, cierra el día con el turno de noche y solo el dueño corrige', async () => {
    reloj('2026-11-08', '19:30')
    const r = await recepcionista(dueno, 'prokinto')
    const turno = await call('/api/hostales/prokinto/turnos/actual', { method: 'POST', token: r.token, json: {} })
    expect(turno.data.turno.tipo).toBe('noche')
    expect(turno.data.turno.fecha).toBe('2026-11-08')
    const sinPago = await registrar(r.token, { habitacion: '2C', huesped: 'Pendiente', tipo: 'Sencilla' }, 'prokinto')
    await registrar(r.token, { habitacion: '501', huesped: 'Pagó', tipo: 'Sencilla', pago: 'efectivo' }, 'prokinto')

    const resumen = await call(`/api/turnos/${turno.data.turno.id}`, { token: r.token })
    expect(resumen.data.sin_pago.map((x: any) => x.habitacion)).toEqual(['2C'])
    expect(resumen.data.efectivo_esperado).toBe(140000)

    const id = turno.data.turno.id
    const movimientos = [
      { tipo: 'depositado', monto: 100000, cuenta: 'BAC 123' },
      { tipo: 'entregado', monto: 40000, recibido_por: 'Don Chepe' },
    ]
    const aviso = await call(`/api/turnos/${id}/cerrar`, { method: 'POST', token: r.token, json: { notas: 'Revisar la 2C', movimientos } })
    expect(aviso.status).toBe(409)
    expect(aviso.data.sin_pago).toHaveLength(1)

    // Ya son las 7:10 a.m. del día siguiente: todavía puede corregir el día de su turno abierto
    reloj('2026-11-09', '07:10')
    expect((await call(`/api/registros/${sinPago.data.id}`, { method: 'PATCH', token: r.token, json: { pago: 'efectivo', precio: 140000 } })).status).toBe(200)
    const cerrado = await call(`/api/turnos/${id}/cerrar`, { method: 'POST', token: r.token, json: { notas: 'Revisar la 2C', movimientos } })
    expect(cerrado.status).toBe(200)
    expect(cerrado.data.movimientos).toHaveLength(2)

    const dia = await env.DB.prepare("SELECT cerrado_en FROM dias WHERE hostal_id = 'prokinto' AND fecha = '2026-11-08'").first<{ cerrado_en: number }>()
    expect(dia?.cerrado_en).toBeTruthy()
    const nuevoDia = await hoy(r.token, 'prokinto')
    expect(nuevoDia.data.nota_anterior.notas).toBe('Revisar la 2C')

    // Recepción ya no puede cambiar el día cerrado; el dueño sí, y queda en el historial
    expect((await call(`/api/registros/${sinPago.data.id}`, { method: 'PATCH', token: r.token, json: { precio: 1 } })).status).toBe(403)
    const corregido = await call(`/api/registros/${sinPago.data.id}`, { method: 'PATCH', token: dueno, json: { precio: 120000 } })
    expect(corregido.status).toBe(200)
    const hist = await call(`/api/historial?entidad_id=${sinPago.data.id}`, { token: dueno })
    expect(hist.data.eventos[0].accion).toBe('corrigió día cerrado')
    expect(hist.data.eventos[0].detalle.cambios.precio).toEqual({ antes: 140000, despues: 120000 })

    // Cuadre: el mes trae los turnos con sus movimientos
    const mes = await call('/api/hostales/prokinto/mes?mes=2026-11', { token: dueno })
    const { cuadreDia } = await import('../../shared/calculos')
    const cuadre = cuadreDia('2026-11-08', mes.data.registros, mes.data.turnos)
    expect(cuadre.esperado).toBe(260000)
    expect(cuadre.declarado).toBe(140000)
    expect(cuadre.diferencia).toBe(-120000)
  })
})

describe('importar CSV', () => {
  it('revisa, avisa duplicados y errores, reconoce Pepsi y une las noches seguidas', async () => {
    const filas = [
      { fecha: '01/10/2026', habitacion: '9', huesped: 'Mario López', empresa: 'Pepsi', tipo: 'Sencilla', precio: '', pago: 'Crédito' },
      { fecha: '02/10/2026', habitacion: '9', huesped: 'MARIO LOPEZ', empresa: 'Emsula', tipo: 'S', precio: '', pago: 'credito' },
      { fecha: '2026-10-02', habitacion: '10', huesped: 'Luisa', empresa: '', tipo: 'Doble', precio: 'L 1,700.00', pago: 'T/C' },
      { fecha: '2026-10-02', habitacion: '10', huesped: 'Otra', empresa: '', tipo: 'Doble', precio: '1700', pago: 'Efectivo' },
      { fecha: '2026-10-03', habitacion: '99', huesped: 'Nadie', empresa: '', tipo: 'Doble', precio: '1700', pago: 'Efectivo' },
      { fecha: '2026-10-03', habitacion: '11', huesped: 'Pedro', empresa: 'Constructora Nueva', tipo: 'Triple', precio: '2000', pago: 'Transferencia' },
      { fecha: '2026-10-03', habitacion: '12', huesped: '', empresa: '', tipo: 'Hora', precio: '500', pago: 'Efectivo' },
    ]
    const vista = await call('/api/hostales/prado-alto/importar', { method: 'POST', token: dueno, json: { filas } })
    expect(vista.status).toBe(200)
    expect(vista.data.validas).toBe(5)
    expect(vista.data.duplicados).toHaveLength(1)
    expect(vista.data.duplicados[0].fila).toBe(5)
    expect(vista.data.errores).toHaveLength(1)
    expect(vista.data.errores[0].motivo).toContain('99')
    expect(vista.data.empresas_nuevas).toEqual(['Constructora Nueva'])
    expect(vista.data.muestra[0].empresa).toBe('Emsula')
    expect(vista.data.muestra[0].precio).toBe(140000)

    const hecho = await call('/api/hostales/prado-alto/importar', { method: 'POST', token: dueno, json: { filas, aplicar: true } })
    expect(hecho.data.importadas).toBe(5)
    const mes = await call('/api/hostales/prado-alto/mes?mes=2026-10', { token: dueno })
    const mario = mes.data.registros.filter((r: any) => r.habitacion === '9')
    expect(mario).toHaveLength(2)
    expect(mario[0].estadia_id).toBe(mario[1].estadia_id)
    expect(mes.data.registros.find((r: any) => r.habitacion === '12').modo).toBe('hora')

    const otraVez = await call('/api/hostales/prado-alto/importar', { method: 'POST', token: dueno, json: { filas } })
    expect(otraVez.data.validas).toBe(1) // solo la de por hora
    expect(otraVez.data.duplicados.length).toBe(5)
  })
})

describe('créditos y empresas', () => {
  it('avisa a los 15 días, alerta roja a los 30, factura y marca pagado', async () => {
    reloj('2026-11-20', '10:00')
    const c = await call('/api/creditos', { token: dueno })
    const emsula = c.data.pendientes.find((p: any) => p.empresa === 'Emsula' && p.hostal_id === 'prado-alto')
    expect(emsula.desde).toBe('2026-10-01')
    expect(emsula.nivel).toBe('rojo')
    const grupo = c.data.pendientes.find((p: any) => p.empresa === 'Grupo Comidas' && p.hostal_id === 'prado-alto')
    expect(grupo.nivel).toBe('aviso') // desde el 5 de noviembre: 15 días

    const factura = await call('/api/facturas', { method: 'POST', token: dueno, json: { hostal_id: 'prado-alto', empresa_id: 'emsula', hasta: '2026-10-31', numero: 'F-001' } })
    expect(factura.status).toBe(201)
    expect(factura.data.noches).toBe(2)
    expect(factura.data.monto).toBe(280000)
    const despues = await call('/api/creditos', { token: dueno })
    const emsula2 = despues.data.pendientes.find((p: any) => p.empresa === 'Emsula' && p.hostal_id === 'prado-alto')
    expect(emsula2.desde).toBe('2026-11-04') // la noche de Carlos sigue pendiente
    const pagada = await call(`/api/facturas/${factura.data.id}`, { method: 'PATCH', token: dueno, json: { pagada: true } })
    expect(pagada.data.pagada_en).toBeTruthy()
    expect((await call(`/api/facturas/${factura.data.id}`, { method: 'DELETE', token: dueno })).status).toBe(409)
  })

  it('une empresas duplicadas', async () => {
    const nueva = await call('/api/empresas', { method: 'POST', token: dueno, json: { nombre: 'Emsula S.A.' } })
    expect(nueva.status).toBe(201)
    expect((await call('/api/empresas', { method: 'POST', token: dueno, json: { nombre: 'pepsi' } })).status).toBe(409)
    const unida = await call('/api/empresas/emsula/unir', { method: 'POST', token: dueno, json: { de: nueva.data.id } })
    expect(unida.status).toBe(200)
    expect(unida.data.alias).toEqual(['Pepsi', 'Emsula S.A.'])
  })
})

describe('tareas', () => {
  it('el dueño asigna, recepción marca hecha y queda quién la hizo', async () => {
    reloj('2026-11-21', '09:00')
    const r = await recepcionista(dueno, 'prokinto', 'Marta')
    const t = await call('/api/hostales/prokinto/tareas', { method: 'POST', token: dueno, json: { texto: 'Cobrar a Emsula', turno: 'dia' } })
    expect(t.status).toBe(201)
    await call('/api/hostales/prokinto/tareas', { method: 'POST', token: dueno, json: { texto: 'Solo de noche', turno: 'noche' } })
    const lista = await call('/api/hostales/prokinto/tareas', { token: r.token })
    expect(lista.data.tareas.map((x: any) => x.texto)).toEqual(['Cobrar a Emsula'])
    const hecha = await call(`/api/tareas/${t.data.id}`, { method: 'PATCH', token: r.token, json: { hecha: true } })
    expect(hecha.data.hecha_por_nombre).toBe('Marta')
  })
})
