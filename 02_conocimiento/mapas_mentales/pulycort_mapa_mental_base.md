# Pulycort - Mapa mental operativo base

Fecha: 2026-06-09

Fuente: explicacion directa del usuario sobre la estructura general de Pulycort.

## Nodo raiz

Pulycort es una fabrica de marmol. Compra bloques de marmol, los procesa y los vende. Tambien vende servicios industriales a terceros, por ejemplo corte o acabados sobre material aportado por otro marmolista.

## Modelo de negocio

- Compra de bloques de marmol.
- Transformacion industrial de bloques en tablas y de tablas en losas.
- Venta de producto propio.
- Produccion para stock.
- Produccion bajo demanda.
- Prestacion de servicios a terceros sobre material externo.

## Estados principales del material

### Bloque

El bloque es el estado inicial del material comprado por la empresa.

Procesos asociados:

- Recepcion y clasificacion.
- Refuerzo cuando el bloque tiene pelos o fisuras.
- Despunte para cuadrar bloques irregulares.
- CNC para piezas complejas si el bloque ya esta cortado a una medida optima.

Concepto clave:

- Un pelo es una fisura o indicio de brecha por donde el bloque podria partirse durante la manipulacion o el aserrado.

### Tabla

La tabla se obtiene al cortar el bloque en el telar mediante el proceso de aserrado.

Procesos asociados:

- Acabados sobre tabla, cuando conviene procesarla antes de convertirla en losa.
- Venta en bruto si no se ejecuta ningun acabado.
- Corte de tablas para convertirlas en losas.

Punto critico:

- En el corte de tablas es muy importante calcular el desperdicio.

### Losa

La losa suele ser el producto final vendido.

Procesos asociados:

- Acabados sobre losa, si no se han realizado previamente sobre tabla.
- Embalaje en pallets de madera para envio.

Regla de negocio:

- El acabado se hace una vez, bien en tabla o bien en losa, segun conveniencia.

## Procesos productivos principales

### Aserrado

Transforma bloques en tablas usando un telar.

Entrada:

- Bloque.

Salida:

- Tabla.

Riesgos o controles:

- Rotura del bloque si hay fisuras no tratadas.
- Necesidad de refuerzo previo en algunos bloques.

### Refuerzo

Se aplica a bloques con pelos o fisuras para reducir el riesgo de rotura durante el aserrado.

Entrada:

- Bloque con riesgo estructural.

Salida:

- Bloque reforzado.

### Despunte

Se aplica cuando un bloque es irregular y conviene cortar sobrantes para cuadrarlo.

Entrada:

- Bloque irregular.

Salida:

- Bloque mas regular y comodo de trabajar.

### CNC sobre bloque

Permite fabricar piezas complejas a partir de bloques ya adaptados a una medida optima.

Ejemplos:

- Baneras.
- Muebles especificos.
- Piezas especiales.

### Acabados

Pueden aplicarse sobre tabla o sobre losa.

Acabados mencionados:

- Pulido.
- Abujardado.
- Arenado.
- Envejecido.
- Acidado.
- Escarfilado.
- En bruto.

### Corte de tablas

Transforma tablas en losas.

Entrada:

- Tabla.

Salida:

- Losa.

Punto critico:

- Calculo del desperdicio.

### Embalaje

Las losas se embalan en pallets de madera para su posterior envio.

Entrada:

- Losa final.

Salida:

- Material preparado para transporte.

## Produccion propia y servicios a terceros

Pulycort puede producir para generar stock o producir directamente bajo demanda.

Tambien puede trabajar material de terceros:

- Un marmolista puede llevar tablas para que Pulycort las corte en losas.
- El cliente tercero define las medidas requeridas.
- Tambien puede contratar un acabado, por ejemplo pulido.
- El mismo esquema aplica a otros servicios, como convertir bloques en tablas.

## Proceso de venta

### Entrada de solicitud

Una peticion de presupuesto o una venta puede entrar por distintos canales:

- Web.
- Comercial.
- Boca a boca.
- Cliente recurrente.
- Otros canales.

### Presupuesto y aceptacion

Flujo general:

1. Entra una peticion de presupuesto o una venta directa.
2. Se envia presupuesto cuando aplica.
3. Al aceptarse el presupuesto y recibirse el pago, se genera una OP.

OP significa orden de produccion.

### Produccion, embalaje y envio

Flujo general:

1. La OP activa o coordina la produccion necesaria.
2. El material final se embala.
3. Se contrata el transporte.

El transporte puede contratarlo:

- Pulycort.
- El cliente.

## Documentacion generada

Documentos mencionados:

- Proformas.
- Facturas.
- Albaranes.
- Ordenes de produccion.
- Documentacion de productividad de maquinas.

Pendiente de ampliar:

- Que documento se genera en cada momento.
- Quien lo genera.
- Desde que datos se genera.
- Que sistema lo guarda.
- Que relacion tiene cada documento con pedido, material, produccion, envio y cobro.

## Relaciones importantes para el mapa mental

- Bloque -> aserrado -> tabla.
- Tabla -> corte de tablas -> losa.
- Tabla o losa -> acabado -> material final.
- Losa -> embalaje -> envio.
- Solicitud -> presupuesto -> aceptacion y pago -> OP -> produccion -> embalaje -> transporte.
- Material propio -> produccion para stock o bajo demanda.
- Material de tercero -> servicio industrial contratado -> entrega procesada.

## Preguntas abiertas para siguientes sesiones

- Que datos minimos debe contener una solicitud para poder presupuestar.
- Como se calcula hoy el desperdicio en el corte de tablas.
- Como se identifica cada bloque, tabla y losa.
- Como se trazan los lotes o partidas desde compra hasta venta.
- Que procesos estan registrados en Odoo u otro sistema.
- Que datos de productividad generan las maquinas.
- Que documentos son obligatorios y cuales son internos.
- Que diferencia documental existe entre venta de producto propio y servicio a terceros.
- Que criterios deciden si se procesa para stock o bajo demanda.
- Que responsables intervienen en cada fase.
