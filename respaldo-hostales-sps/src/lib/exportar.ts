// Descargas: Excel (.xlsx armado aquí mismo, sin librerías pesadas) y CSV que se puede volver a importar.

import { strToU8, zipSync } from 'fflate'
import { cuadreDia, resumenMes } from '../../shared/calculos'
import { fechasDelMes, nombreMes } from '../../shared/fechas'
import { NOMBRE_PAGO, type Hostal, type Registro, type Turno } from '../../shared/reglas'

type Celda = string | number | null | { dinero: number | null } | { porcentaje: number }

interface HojaExcel {
  nombre: string
  filas: Celda[][]
  anchos?: number[]
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function columna(i: number) {
  let s = ''
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  return s
}

function celdaXml(c: Celda, ref: string, negrita: boolean) {
  if (c == null) return ''
  if (typeof c === 'number') return `<c r="${ref}"${negrita ? ' s="1"' : ''}><v>${c}</v></c>`
  if (typeof c === 'string') return `<c r="${ref}" t="inlineStr"${negrita ? ' s="1"' : ''}><is><t xml:space="preserve">${esc(c)}</t></is></c>`
  if ('dinero' in c) return c.dinero == null ? '' : `<c r="${ref}" s="${negrita ? 3 : 2}"><v>${c.dinero / 100}</v></c>`
  return `<c r="${ref}" s="4"><v>${c.porcentaje}</v></c>`
}

function hojaXml(h: HojaExcel) {
  const filas = h.filas
    .map((fila, i) => `<row r="${i + 1}">${fila.map((c, j) => celdaXml(c, `${columna(j)}${i + 1}`, i === 0)).join('')}</row>`)
    .join('')
  const cols = h.anchos?.length ? `<cols>${h.anchos.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : ''
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>${cols}<sheetData>${filas}</sheetData></worksheet>`
}

const ESTILOS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;L&quot; #,##0.00"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="5">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
<xf numFmtId="10" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`

export function crearXlsx(hojas: HojaExcel[]) {
  const n = hojas.length
  const archivos: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${hojas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`,
    ),
    '_rels/.rels': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ),
    'xl/workbook.xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${hojas.map((h, i) => `<sheet name="${esc(h.nombre.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`,
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${hojas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${n + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    ),
    'xl/styles.xml': strToU8(ESTILOS),
  }
  hojas.forEach((h, i) => (archivos[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(hojaXml(h))))
  const zip = zipSync(archivos, { level: 6 })
  return new Blob([zip.buffer as ArrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

export function descargar(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 5000)
}

const textoPago = (r: Registro) => (r.pago ? NOMBRE_PAGO[r.pago] : '')
const nombreArchivo = (h: Hostal, mes: string) => `${h.nombre.replace(/^Hostal /, '').replace(/\s+/g, '-')}-${mes}`

/** CSV con las mismas columnas que se importan (fecha, habitacion, huesped, empresa, tipo, precio, pago) y algunas más. */
export function csvDelMes(h: Hostal, mes: string, registros: Registro[]) {
  const campo = (v: string | number | null) => {
    const s = v == null ? '' : String(v)
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const filas = [
    ['fecha', 'habitacion', 'huesped', 'empresa', 'tipo', 'precio', 'pago', 'estadia_larga', 'factura', 'registro', 'nota'],
    ...registros.map((r) => [
      r.fecha,
      r.habitacion,
      r.huesped,
      r.empresa ?? '',
      r.modo === 'hora' ? 'Hora' : r.tipo,
      r.precio == null ? '' : (r.precio / 100).toFixed(2),
      textoPago(r),
      r.larga ? 'sí' : '',
      r.factura_id ? 'sí' : '',
      r.creado_por_nombre ?? '',
      r.nota,
    ]),
  ]
  const texto = '﻿' + filas.map((f) => f.map(campo).join(',')).join('\r\n')
  descargar(new Blob([texto], { type: 'text/csv;charset=utf-8' }), `${nombreArchivo(h, mes)}.csv`)
}

/** Excel del mes: noches, resumen e impuestos, por habitación, por huésped y caja. */
export function excelDelMes(h: Hostal, mes: string, hoy: string, registros: Registro[], turnos: Turno[]) {
  const habitaciones = h.habitaciones.filter((x) => x.activa).map((x) => x.numero)
  const r = resumenMes(registros, habitaciones, mes, hoy)
  const d = (c: number | null) => ({ dinero: c })
  const hojas: HojaExcel[] = [
    {
      nombre: 'Noches',
      anchos: [12, 11, 9, 28, 20, 10, 13, 14, 10, 10, 14, 30],
      filas: [
        ['Fecha', 'Habitación', 'Modo', 'Huésped', 'Empresa', 'Tipo', 'Precio', 'Pago', 'Estadía larga', 'Facturado', 'Registró', 'Nota'],
        ...registros.map((x) => [x.fecha, x.habitacion, x.modo === 'hora' ? 'Por hora' : 'Noche', x.huesped, x.empresa, x.tipo, d(x.precio), textoPago(x) || 'Sin pago', x.larga ? 'Sí' : '', x.factura_id ? 'Sí' : '', x.creado_por_nombre ?? '', x.nota]),
      ],
    },
    {
      nombre: 'Resumen',
      anchos: [34, 18],
      filas: [
        ['Concepto', 'Valor'],
        ['Hostal', h.nombre],
        ['Mes', nombreMes(mes)],
        ['Noches ocupadas', r.noches],
        ['Capacidad (habitaciones × días)', r.capacidad],
        ['Ocupación', { porcentaje: r.ocupacion }],
        ['Día más lleno', r.diaMasLleno ? `${r.diaMasLleno.fecha} (${r.diaMasLleno.noches} hab.)` : '—'],
        ['Huéspedes distintos', r.huespedes],
        ['Alquileres por hora', r.horas.cantidad],
        ['Ingresos por hora', d(r.horas.total)],
        ['Total vendido', d(r.ingresos.vendido)],
        ['Cobrado (sin crédito)', d(r.ingresos.cobrado)],
        ['Crédito (precio de lista)', d(r.ingresos.credito)],
        ['Sin forma de pago', d(r.ingresos.pendiente)],
        ['Precio promedio por noche', d(r.ingresos.promedioNoche)],
        ['Base (total / 1.19)', d(r.ingresos.base)],
        ['ISV 15 %', d(r.ingresos.isv)],
        ['Turismo 4 %', d(r.ingresos.turismo)],
        ...r.ingresos.porPago.map((p): Celda[] => [`Pago: ${p.pago === 'pendiente' ? 'Sin pago' : NOMBRE_PAGO[p.pago]} (${p.registros})`, d(p.monto)]),
      ],
    },
    {
      nombre: 'Por habitación',
      anchos: [12, 10, 12, 16],
      filas: [['Habitación', 'Noches', 'Ocupación', 'Ingresos'], ...r.porHabitacion.map((x) => [x.numero, x.noches, { porcentaje: r.dias ? x.noches / r.dias : 0 }, d(x.ingresos)])],
    },
    {
      nombre: 'Por huésped',
      anchos: [30, 24, 9, 9, 30, 16, 16],
      filas: [
        ['Huésped', 'Empresa', 'Noches', 'Por hora', 'Fechas', 'Habitaciones', 'Total'],
        ...r.porHuesped.map((x) => [x.nombre, x.empresas.join(', '), x.noches, x.horas, x.rango, x.habitaciones.join(', '), d(x.total)]),
      ],
    },
    {
      nombre: 'Caja',
      anchos: [12, 18, 16, 16, 14, 16, 14, 10],
      filas: [
        ['Fecha', 'Efectivo esperado', 'Declarado', 'Diferencia', 'Tarjeta', 'Transferencia', 'Crédito', 'Cerrado'],
        ...fechasDelMes(mes)
          .filter((f) => f <= hoy)
          .map((f) => {
            const c = cuadreDia(f, registros, turnos)
            return [f, d(c.esperado), d(c.declarado), d(c.diferencia), d(c.porPago.tarjeta ?? 0), d(c.porPago.transferencia ?? 0), d(c.porPago.credito ?? 0), c.cerrado ? 'Sí' : 'No']
          }),
      ],
    },
  ]
  descargar(crearXlsx(hojas), `${nombreArchivo(h, mes)}.xlsx`)
}

/** Lee un CSV (con coma o punto y coma, con o sin comillas) y regresa filas con los nombres de columna normalizados. */
export function leerCsv(texto: string) {
  const limpio = texto.replace(/^﻿/, '')
  const primera = limpio.split(/\r?\n/, 1)[0] ?? ''
  const sep = (primera.match(/;/g)?.length ?? 0) > (primera.match(/,/g)?.length ?? 0) ? ';' : primera.includes('\t') && !primera.includes(',') ? '\t' : ','
  const filas: string[][] = []
  let fila: string[] = []
  let campo = ''
  let comillas = false
  for (let i = 0; i < limpio.length; i++) {
    const ch = limpio[i]
    if (comillas) {
      if (ch === '"' && limpio[i + 1] === '"') {
        campo += '"'
        i++
      } else if (ch === '"') comillas = false
      else campo += ch
    } else if (ch === '"') comillas = true
    else if (ch === sep) {
      fila.push(campo)
      campo = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && limpio[i + 1] === '\n') i++
      fila.push(campo)
      filas.push(fila)
      fila = []
      campo = ''
    } else campo += ch
  }
  if (campo || fila.length) {
    fila.push(campo)
    filas.push(fila)
  }
  const [encabezados, ...resto] = filas.filter((f) => f.some((c) => c.trim()))
  if (!encabezados) return { columnas: [], filas: [] }
  const SINONIMOS: Record<string, string> = {
    fecha: 'fecha',
    dia: 'fecha',
    habitacion: 'habitacion',
    hab: 'habitacion',
    cuarto: 'habitacion',
    huesped: 'huesped',
    cliente: 'huesped',
    nombre: 'huesped',
    empresa: 'empresa',
    compania: 'empresa',
    tipo: 'tipo',
    precio: 'precio',
    monto: 'precio',
    valor: 'precio',
    pago: 'pago',
    forma_de_pago: 'pago',
    formadepago: 'pago',
  }
  const columnas = encabezados.map((e) => {
    const n = e
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '_')
    return SINONIMOS[n] ?? SINONIMOS[n.replace(/_/g, '')] ?? n
  })
  return {
    columnas,
    filas: resto.map((f) => Object.fromEntries(columnas.map((c, i) => [c, (f[i] ?? '').trim()]))),
  }
}
