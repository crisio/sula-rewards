# Hostales SPS

Recepción y supervisión de **Hostal Prado Alto** (habitaciones 1 a 14) y **ProKinto** (501 a 511 y 2C), en San Pedro
Sula. Reemplaza el «Reporte de ventas diarias» en papel: recepción registra todo desde el celular y el dueño supervisa
los dos hostales en tiempo real. Todo en español y en lempiras.

## Qué hace

### Recepción (cada recepcionista ve solo su hostal y su día de trabajo)

- **Tablero del día** con todas las habitaciones como llaves de colores: libre, ocupada, por hora, sale hoy y limpieza,
  más los contadores de cada estado y la caja del día.
- **Registrar** con un toque: huésped (con autocompletar de huéspedes recientes), empresa (con autocompletar y alias:
  «Pepsi» es Emsula), tipo, precio sugerido según el tipo, forma de pago y nota. En **crédito** no se pide precio: se
  valora con el precio de lista. Casilla de **estadía de más de un mes** (−L 150 por noche).
- **Por hora**: la habitación queda bloqueada hasta que recepción cierra el alquiler y pone el precio y el pago.
- **Copiar huéspedes de ayer** para los que siguen (grupos y estadías largas). El crédito se copia; el efectivo queda
  «sin pago» para cobrarlo hoy (o se copia la forma de pago si se marca). Pasados 30 días seguidos, el descuento de
  estadía larga se aplica solo.
- **Salida automática a las 11:30 a.m.** de las estadías por noche: la habitación pasa a **limpieza** y recepción la
  marca lista. También se puede marcar «ya salió» antes.
- **Cierre de turno**: notas para el siguiente turno, efectivo **entregado** (a quién) y **depositado** (cuenta,
  referencia, foto de la boleta). Si hay habitaciones sin forma de pago, avisa antes de cerrar.
- **Foto del voucher** de tarjeta o del comprobante de transferencia o depósito.
- **Tareas del turno** que asigna el dueño, con casilla de hecho y quién la hizo.

### Dueño (ve los dos hostales)

- **Hoy**: ocupación de cada hostal, quién está de turno, si el día se cerró, cuadre de ayer y alertas (turnos sin
  cerrar, habitaciones sin pago, alquileres por hora olvidados, créditos por facturar, diferencias de caja).
- **Contabilidad**, separada por hostal y con selector de mes: noches ocupadas, capacidad (habitaciones × días),
  % de ocupación, día más lleno, huéspedes distintos, **calendario** de habitaciones × días coloreado por huésped (al
  tocar un cuadro: huésped, empresa, tipo, precio y pago, y se puede corregir), noches e ingresos por habitación,
  detalle por huésped con las fechas agrupadas («1–5, 9–31 oct»), ingresos por forma de pago, precio promedio por noche
  e **impuestos incluidos** (base = total ÷ 1.19; ISV = base × 15 %; turismo = base × 4 %).
- **Descargar cualquier mes** en Excel (.xlsx con hojas de noches, resumen, por habitación, por huésped y caja) o CSV.
- **Créditos**: noches y valor por empresa a precio de lista; aviso a los 15 días de la primera noche y alerta roja a
  los 30. Marcar facturado (hasta una fecha, con número de factura) y pagado.
- **Caja**: cuadre diario del efectivo que suman las habitaciones contra lo declarado al cerrar los turnos, con las
  diferencias marcadas, los movimientos y las fotos de cada turno, y «marcar revisado» con nota.
- **Más**: tareas, historial de cambios (quién, qué y cuándo), empresas (agregar, editar, alias y unir duplicadas),
  personal (recepcionistas y PIN), hostales y precios (precios de lista, precio por hora sugerido, horarios y tipo de
  cada habitación), permisos y bloqueo, e importar CSV.

### Reglas

- **La fecha la pone el servidor**, con la hora de Honduras: nadie cambia la fecha a mano y la hora del teléfono no
  importa. El día de trabajo cambia cuando empieza el turno de día (7:00 a.m.): quien llega a las 2 a.m. queda en la
  noche de ayer y sale a las 11:30.
- **Turnos**: día de 7:00 a.m. a 7:00 p.m. y noche de 7:00 p.m. a 7:00 a.m. (se cambian en Hostales y precios). Al
  cerrar el turno de noche se cierra el día: después **solo el dueño** puede corregirlo y queda en el historial.
- **Una habitación no puede tener dos huéspedes la misma noche**: la app no lo deja y avisa con quién choca.
- **Tiempo real**: cada teléfono revisa cada pocos segundos si algo cambió y se actualiza solo.
- **Bloqueo por inactividad** (10 min por defecto, configurable): pide el PIN otra vez.
- **PIN** guardado cifrado (PBKDF2); 5 intentos fallidos bloquean al usuario 5 minutos.
- Recepción ve los totales del día pero no la contabilidad ni el mes (el dueño lo puede cambiar en Permisos).

## Publicar (GitHub Actions + Cloudflare, plan gratis)

La app y la API se publican juntas en un **Cloudflare Worker** con base de datos **D1**. El flujo
[`publicar.yml`](.github/workflows/publicar.yml) corre las pruebas en cada cambio y publica cada vez que se sube algo a
`main`.

1. En el repo: **Settings → Secrets and variables → Actions → New repository secret** y agrega:
   - `CLOUDFLARE_API_TOKEN`: un token de Cloudflare (My Profile → API Tokens → Create Token → plantilla **Edit
     Cloudflare Workers**, y agrega el permiso **Account → D1 → Edit**). Sirve el mismo que usa sula-rewards.
   - `CLOUDFLARE_ACCOUNT_ID`: el Account ID de Cloudflare (aparece en la página de Workers).
   - `PIN_DUENO`: el PIN (4 a 8 números) con que vas a entrar como dueño la primera vez.
2. Ve a **Actions → Pruebas y publicación → Run workflow** (o sube cualquier cambio a `main`). La primera vez
   Cloudflare crea la base de datos `hostales-sps`. Al terminar, el resumen del flujo muestra la dirección de la app
   (`https://hostales-sps.<tu-subdominio>.workers.dev`).
3. Abre la app, toca **Entrar como dueño** y escribe tu `PIN_DUENO`. Puedes cambiarlo en el menú → Cambiar mi PIN.
4. En **Más → Personal** agrega a los recepcionistas de cada hostal con su PIN.
5. En **Más → Hostales y precios** revisa los precios de ProKinto y el tipo de cada habitación.
6. En **Más → Importar CSV** carga los reportes de octubre de cada hostal.
7. En cada celular de recepción, abre la dirección y usa «Agregar a pantalla de inicio».

**Si olvidas el PIN del dueño**: desde la computadora, con el mismo token, corre
`npx wrangler d1 execute hostales-sps --remote --command "UPDATE usuarios SET activo = 0 WHERE rol = 'dueno'"` dentro de
`api/` y vuelve a entrar con `PIN_DUENO` (se crea un usuario dueño nuevo; el historial anterior se conserva).

## Importar los reportes (CSV)

La primera fila debe tener las columnas `fecha, habitacion, huesped, empresa, tipo, precio, pago` (también acepta punto
y coma). Ejemplo en [`docs/ejemplo-importar.csv`](docs/ejemplo-importar.csv).

- **fecha**: `01/10/2026` (día/mes/año) o `2026-10-01`.
- **habitacion**: `1`…`14` en Prado Alto; `501`…`511` o `2C` en ProKinto.
- **tipo**: Sencilla, Doble, Triple (o S, D, T); `Hora` para alquiler por hora.
- **precio**: `1400`, `1,400` o `L 1,400.00`. En crédito puede ir vacío: se usa el precio de lista.
- **pago**: Efectivo, T/C (o Tarjeta), Transferencia, Crédito u Otros. Vacío = sin pago.
- **empresa**: se reconoce por nombre o alias («Pepsi» → Emsula). Las que no existen se crean.

Antes de importar se muestra una revisión: filas válidas, errores, empresas nuevas y **noches repetidas** (dos huéspedes
en la misma habitación y noche, en el archivo o ya registrados), que no se importan. Las noches seguidas del mismo
huésped en la misma habitación quedan unidas como una estadía.

## Desarrollo

```
src/            la app (React + Vite): recepción y panel del dueño
shared/         reglas y cálculos compartidos (fechas de Honduras, precios, estado de las habitaciones,
                resumen del mes, cuadre de caja, antigüedad de créditos)
api/src/        la API (Cloudflare Worker con Hono)
api/migrations/ el esquema de la base D1 y los datos iniciales (hostales, habitaciones, empresas)
api/test/       pruebas de la API (Vitest con el entorno de Workers)
```

```bash
npm install && npm --prefix api install
echo 'PIN_DUENO="246810"' > api/.dev.vars
npm --prefix api run db:migrate:local
npm run build && npm --prefix api run dev   # app y API en http://localhost:8787
npm test                                     # pruebas de la API
```

Para trabajar en la app con recarga en vivo: `npm --prefix api run dev` en una terminal y `npm run dev` en otra
(Vite reenvía `/api` al puerto 8787).
