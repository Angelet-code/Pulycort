# Pulycort - Pre-auditoria de procesos internos e integracion de IA

Fecha: 2026-06-08

## Objetivo

Preparar una pre-auditoria para identificar donde puede aportar mas valor la IA y la automatizacion dentro de Pulycort, con foco en agilidad operativa, reduccion de costes, mejora de comodidad para el equipo, trazabilidad, productividad industrial y mejor toma de decisiones.

El objetivo no es "meter IA" de forma generica. El objetivo es entender los procesos reales de la empresa, detectar tareas repetitivas o mal conectadas, ordenar los datos y construir herramientas que reduzcan trabajo manual, errores, tiempos de respuesta y dependencia de conocimiento informal.

## Nota de alcance

Este documento parte de:

- Conversaciones iniciales con el dueno.
- Informacion publica de la web de Pulycort.
- Hipotesis razonables sobre una fabrica de marmol y piedra natural.
- Informacion publica sobre Odoo, SIMEC y obligaciones de facturacion en Espana.

No sustituye a la auditoria en planta. Muchas oportunidades dependen de datos que todavia hay que validar: sistema Odoo contratado, volumen de pedidos, flujo documental real, formatos de datos de maquinas, responsables internos, tiempos, errores, costes y prioridades del negocio.

## Fuentes publicas revisadas

- Web principal: https://pulycort.com/
- Proceso de Pulycort: https://pulycort.com/proceso/
- Fabricacion espanola: https://pulycort.com/fabricacion-espanola/
- Producto Crema Marfil: https://pulycort.com/producto-crema-marfil/
- Odoo External RPC API: https://www.odoo.com/documentation/19.0/th/developer/reference/external_rpc_api.html
- Odoo.sh FAQ: https://www.odoo.sh/faq
- AEAT - VERI*FACTU: https://sede.agenciatributaria.gob.es/Sede/procedimientos/IZ86.shtml
- AEAT - Facturacion electronica obligatoria: https://sede.agenciatributaria.gob.es/Sede/todas-noticias/2026/marzo/31/facturacion-electronica-obligatoria.html
- SIMEC, maquinaria para piedra natural: https://www.simec.it/

## Resumen ejecutivo

Pulycort tiene un escenario muy favorable para aplicar IA porque combina tres capas de actividad:

1. Actividad comercial con mucho documento, email, presupuestos, pedidos y seguimiento.
2. Actividad industrial con maquinas, bloques, tablas, cortes, acabados, mermas, tiempos y rendimiento.
3. Actividad administrativa con facturas, albaranes, compras, stock, logistica, informes y reporting.

La mayor oportunidad inicial esta en conectar y automatizar el flujo:

Lead o solicitud -> presupuesto -> pedido -> orden de produccion -> fabricacion -> control de calidad -> albaran -> factura -> seguimiento.

Si ese flujo queda bien modelado en Odoo y apoyado por IA, la empresa puede reducir mucho trabajo manual, evitar doble entrada de datos y ganar visibilidad real sobre margenes, plazos, productividad y problemas.

La recomendacion inicial es avanzar en tres niveles:

1. Quick wins de baja friccion: email inteligente, extraccion de datos, borradores de respuesta, resumen de informes solares, documentacion automatica y asistente interno.
2. Core operativo: Odoo bien modelado, automatizacion de documentos, facturacion asistida, CRM/pedidos/produccion integrados y trazabilidad de lotes.
3. Inteligencia industrial: SIMEC, datos de maquina, rendimiento, mermas, mantenimiento, calidad, energia y planificacion.

## Diagnostico inicial del negocio

Segun la informacion publica, Pulycort no es solo una comercializadora. Es una empresa industrial de piedra natural con fabricacion, transformacion, acabados, control de calidad, embalaje y envio. Esto es importante porque la IA puede aportar valor en toda la cadena, no solo en marketing.

Areas visibles del negocio:

- Seleccion y compra de bloques/tablas de marmol y piedra natural.
- Transformacion de bloques en tablas o piezas.
- Acabados: pulido, apomazado, abujardado, arenado, cuero/leather y otros.
- Fabricacion a medida.
- Control de calidad.
- Embalaje y envio nacional/internacional.
- Venta B2B y posiblemente B2C.
- Contenido comercial, web, tienda, blog, redes, formularios y captacion digital.

Areas internas probables:

- Recepcion de solicitudes por comercial, email, web, llamadas, WhatsApp o clientes recurrentes.
- Elaboracion manual o semimanual de presupuestos.
- Generacion de pedidos, ordenes de produccion, albaranes y facturas.
- Compras de materia prima.
- Gestion de stock.
- Planificacion de maquina y personal.
- Partes de produccion.
- Seguimiento de incidencias, reclamaciones, roturas, retrasos o defectos.
- Control financiero, cobros, pagos y margenes.

## Principio clave de la auditoria

Antes de construir herramientas de IA, hay que localizar donde se pierde tiempo o dinero por:

- Doble entrada de datos.
- Emails sin clasificar.
- Informacion que vive en la cabeza de una persona.
- Documentos generados a mano.
- Excel sueltos.
- Falta de trazabilidad entre presupuesto, pedido, produccion, albaran y factura.
- Datos de maquina que existen pero no se aprovechan.
- Stock poco fiable.
- Informes que alguien interpreta manualmente.
- Decisiones tomadas sin indicadores.

La IA sera util si se apoya en procesos claros y datos ordenados. Si el proceso esta roto, la IA solo hara mas rapido el desorden.

## Prioridades recomendadas

| Prioridad | Area | Impacto | Friccion | Motivo |
|---|---|---:|---:|---|
| 1 | Flujo pedido-documentos-Odoo | Muy alto | Media | Es el centro operativo de la empresa |
| 2 | Email y entrada de solicitudes | Alto | Baja | Mucho volumen, facil demostrar valor |
| 3 | Facturacion y albaranes | Alto | Media | Hay trabajo manual claro y riesgo de errores |
| 4 | Datos de produccion y SIMEC | Alto | Media-alta | Puede desbloquear productividad y rendimiento |
| 5 | Compras, stock y trazabilidad | Alto | Media | Afecta margen, plazos y servicio |
| 6 | Reporting de energia/placas solares | Medio | Baja | Quick win perfecto y poco invasivo |
| 7 | Asistente interno documental | Medio-alto | Baja | Reduce dependencia de personas clave |
| 8 | Marketing, contenidos y CRM | Medio | Baja-media | Util, pero no debe tapar el core operativo |
| 9 | Vision artificial/calidad | Alto | Alta | Potente, pero requiere datos e imagenes etiquetadas |

## Donde habra mas retorno con menos friccion

### 1. Email inteligente y clasificacion de solicitudes

Problema probable:

Llegan pedidos y consultas por multiples vias: comerciales, email, web, clientes recurrentes, llamadas o WhatsApp. Parte de la informacion llega desordenada, incompleta o en distintos idiomas.

Oportunidad:

Crear una bandeja inteligente que lea emails y formularios, clasifique cada mensaje y extraiga datos clave:

- Cliente.
- Pais/idioma.
- Tipo de solicitud.
- Material.
- Formato.
- Medidas.
- Grosor.
- Acabado.
- Cantidad.
- Fecha deseada.
- Direccion de envio.
- Documentos adjuntos.
- Datos faltantes.
- Urgencia.

IA aplicable:

- Clasificacion de emails.
- Extraccion de datos desde texto, PDF, Excel, imagenes o planos simples.
- Resumen de conversaciones largas.
- Borrador de respuesta.
- Deteccion de datos faltantes.
- Creacion o actualizacion de oportunidad en Odoo.

Por que tiene poca friccion:

No cambia radicalmente el trabajo del empleado. Le da una bandeja mas ordenada y borradores que puede validar.

Riesgo:

No automatizar el envio sin revision humana al principio. La IA debe preparar, no decidir sola.

### 2. Generacion documental desde una unica fuente de verdad

Problema probable:

Para un mismo pedido se generan varios documentos: presupuesto, pedido, orden de produccion, factura y albaran. Si cada documento se crea manualmente o copiando datos, aparecen errores y perdida de tiempo.

Oportunidad:

Crear un flujo donde los datos se introduzcan una vez y se reutilicen:

1. Solicitud del cliente.
2. Presupuesto.
3. Confirmacion de pedido.
4. Orden de produccion.
5. Albaran.
6. Factura.
7. Documentacion logistica o comercial adicional.

IA aplicable:

- Transformar emails en borradores de presupuesto.
- Generar orden de produccion con instrucciones claras.
- Revisar inconsistencias entre documentos.
- Preparar factura/albaran desde pedido confirmado.
- Traducir documentos comerciales.
- Generar descripciones tecnicas normalizadas.

Por que tiene alto retorno:

Reduce errores, tiempos administrativos y dependencia de una persona. Tambien mejora la trazabilidad.

Punto clave:

Esto deberia apoyarse en Odoo. No conviene crear un sistema paralelo si Odoo ya va a ser el ERP/CRM.

### 3. Facturacion manual

Problema probable:

Si las facturas se generan manualmente por una persona, hay coste directo, riesgo de error y dependencia operativa.

Oportunidad:

Automatizar o semiautomatizar la factura a partir del pedido/albaran validado, con revision humana en excepciones.

IA aplicable:

- Validacion de datos antes de facturar.
- Deteccion de inconsistencias: cliente, CIF/VAT, direccion, importes, impuestos, condiciones, moneda, incoterm.
- Generacion de borrador.
- Resumen de facturas pendientes.
- Reconciliacion simple con pedidos/albaranes.

Importante:

Hay que revisar con asesor/partner Odoo las obligaciones de facturacion en Espana, VERI*FACTU y facturacion electronica B2B. No debe tratarse como un detalle tecnico menor.

### 4. Informes de placas solares y energia

Problema:

Si alguien dedica tiempo a interpretar informes de rendimiento solar, probablemente es una tarea repetitiva con retorno claro para automatizar.

Oportunidad:

Crear un lector automatico de informes o conectar con la plataforma del inversor/instalador para generar un resumen mensual:

- Produccion solar.
- Consumo total.
- Autoconsumo.
- Excedentes.
- Ahorro estimado.
- Desviacion frente a esperado.
- Dias anormales.
- Relacion entre consumo y produccion industrial.

IA aplicable:

- Lectura de PDFs o emails.
- Resumen ejecutivo.
- Deteccion de anomalas.
- Generacion de informe mensual.

Por que es buen quick win:

Es poco sensible, poco invasivo y demuestra valor rapidamente.

### 5. Asistente interno de conocimiento

Problema:

En empresas industriales suele haber mucho conocimiento distribuido en personas, manuales, PDFs, emails antiguos, fichas tecnicas, tarifas, normas internas y procedimientos.

Oportunidad:

Crear un asistente interno que responda preguntas como:

- Que acabado se recomienda para exterior?
- Como se prepara una orden de produccion?
- Que datos necesita un presupuesto?
- Que hacer si una maquina reporta un error?
- Que condiciones comerciales aplicar a cierto tipo de cliente?
- Como embalar cierto formato?
- Como se clasifica un material?

IA aplicable:

- Busqueda semantica en documentos internos.
- Respuestas con fuentes.
- Procedimientos paso a paso.
- Resumen de manuales de maquina.
- Traduccion y adaptacion de fichas tecnicas.

Por que tiene baja friccion:

Ayuda al empleado sin sustituir su criterio. Es especialmente util para incorporar gente nueva o evitar interrupciones constantes.

## Donde esta el mayor retorno estrategico

### 1. Odoo como columna vertebral

La compra de Odoo es una oportunidad enorme, pero tambien un riesgo si se configura sin pensar en el proceso industrial real.

Odoo no debe ser solo "un CRM adaptado". Deberia convertirse en la fuente principal de:

- Clientes.
- Oportunidades.
- Presupuestos.
- Pedidos.
- Produccion.
- Compras.
- Stock.
- Facturas.
- Albaranes.
- Trazabilidad.
- Reporting.

Primera pregunta critica:

Que Odoo han contratado?

Opciones posibles:

- Odoo Online Standard.
- Odoo Online Custom.
- Odoo.sh.
- Instalacion on-premise.
- Partner con desarrollos propios.

Por que importa:

Segun la documentacion oficial de Odoo, el acceso por API externa y la personalizacion dependen del plan y del entorno. Si tienen un plan limitado, algunas integraciones profundas pueden requerir cambio de plan, partner o arquitectura alternativa.

Preguntas para el partner Odoo:

1. Que plan exacto tiene Pulycort?
2. Hay acceso a API externa?
3. Se pueden crear modulos personalizados?
4. Se puede conectar con email, web, maquinas y documentos?
5. Que modulos se han comprado o activado?
6. Como se modelara la produccion?
7. Como se modelaran bloques, tablas, lotes, acabados y formatos?
8. Como se gestionara stock reservado vs disponible?
9. Como se generaran factura y albaran?
10. Que restricciones hay para automatizaciones externas?

Recomendacion:

No desarrollar una herramienta paralela hasta saber el alcance real de Odoo. La IA debe integrarse con Odoo siempre que sea viable.

### 2. Trazabilidad bloque-tabla-pedido-cliente

En una fabrica de marmol, la trazabilidad puede tener mucho valor economico.

Datos clave:

- Proveedor.
- Cantera/origen.
- Bloque.
- Tabla.
- Lote.
- Material.
- Calidad/clasificacion.
- Fotos.
- Defectos.
- Medidas.
- Grosor.
- Acabado.
- Coste de compra.
- Coste de transformacion.
- Pedido asociado.
- Cliente.
- Mermas.
- Reclamaciones.

Oportunidad:

Saber que bloques, materiales, proveedores y acabados generan mejor rendimiento real, menos incidencias y mejor margen.

IA aplicable:

- Clasificacion asistida con fotos.
- Busqueda visual de tablas.
- Recomendacion de stock para un pedido.
- Deteccion de patrones de merma o reclamaciones.
- Resumen de rendimiento por proveedor/material.

Condicion previa:

Codificacion clara de lotes y stock. Sin identificadores consistentes, la IA tendra poco donde apoyarse.

### 3. Produccion, maquinas y rendimiento

Los datos de produccion pueden convertirse en una ventaja real si se capturan bien.

Metricas relevantes:

- m2 producidos por dia/turno/maquina.
- Tiempo de corte.
- Tiempo de parada.
- Causa de parada.
- Rendimiento por bloque.
- Merma por material/acabado/grosor.
- Reprocesos.
- Consumo energetico.
- Incidencias.
- Cumplimiento de fecha prometida.
- Productividad por tipo de trabajo.

IA aplicable:

- Deteccion de anomalas.
- Prediccion de retrasos.
- Clasificacion de causas de parada.
- Recomendaciones de planificacion.
- Alertas de bajo rendimiento.
- Resumen diario de produccion.

Error a evitar:

Empezar por prediccion avanzada sin datos fiables. Primero hay que capturar, limpiar y visualizar.

### 4. SIMEC y servidor interno

Se ha mencionado una maquina SIMEC, probablemente un telar o equipo de corte, que envia datos a un servidor interno. Hay un problema: no llegan los datos, no se pueden interpretar o no se estan explotando.

Hipotesis posibles:

- La maquina si envia datos, pero nadie sabe leer el formato.
- El servidor recibe archivos, pero no estan documentados.
- Hay una base de datos local sin credenciales claras.
- Los timestamps o codificaciones estan mal.
- El software del fabricante requiere licencia.
- La red industrial bloquea el acceso.
- El protocolo no es estandar o no se ha conectado bien.
- Se estan generando logs, pero no se integran con ningun sistema.

Auditoria tecnica SIMEC:

1. Identificar modelo exacto de maquina.
2. Identificar software instalado.
3. Revisar PLC/HMI y documentacion.
4. Localizar servidor interno.
5. Revisar carpetas, logs, bases de datos, servicios y puertos.
6. Ver si exporta CSV, XML, SQL, API, OPC-UA, Modbus, FTP u otro protocolo.
7. Capturar datos crudos antes de transformarlos.
8. Crear diccionario de campos.
9. Comparar datos de maquina con partes reales de produccion.
10. Definir integracion con Odoo o dashboard intermedio.

Recomendacion:

Crear primero un "colector edge" en red local que guarde una copia de datos crudos. Despues se transforma y se envia a Odoo/dashboard. No tocar controles de maquina ni red industrial sin apoyo tecnico adecuado.

## Areas adicionales que conviene auditar

### Compras de bloques y tablas

Preguntas clave:

- Quien compra?
- Como se decide proveedor?
- Se documentan fotos y calidad?
- Se mide rendimiento posterior por proveedor?
- Hay reclamaciones a proveedor?
- Se compra por oportunidad o por plan de ventas?
- Como se valoran bloques/tablas en stock?

IA aplicable:

- Resumen de compras.
- Comparativa proveedor-coste-rendimiento.
- Deteccion de materiales con baja rotacion.
- Recomendacion de compra basada en demanda historica.

### Stock y disponibilidad real

Preguntas clave:

- El stock en sistema coincide con el stock fisico?
- Se distingue disponible, reservado, defectuoso y en transformacion?
- Hay fotos asociadas a cada tabla/lote?
- Se puede saber rapidamente si un pedido es fabricable?

IA aplicable:

- Busqueda asistida de material disponible.
- Respuesta rapida a comerciales.
- Deteccion de incoherencias en stock.
- Resumen de stock lento u obsoleto.

### Calidad, incidencias y reclamaciones

Preguntas clave:

- Se registran defectos?
- Se fotografian?
- Se vinculan a pedido, lote, maquina y proveedor?
- Se clasifican causas?
- Se mide coste de no calidad?

IA aplicable:

- Clasificacion de defectos desde texto/foto.
- Resumen de reclamaciones.
- Analisis de causa raiz.
- Priorizacion de acciones correctivas.

### Logistica y exportacion

Preguntas clave:

- Que documentos se preparan para envio?
- Hay Incoterms?
- Se generan packing lists?
- Hay seguros, aduanas, certificados o instrucciones por pais?
- Donde se producen errores o retrasos?

IA aplicable:

- Checklist documental por pais/tipo de envio.
- Generacion de borradores.
- Deteccion de datos faltantes.
- Traduccion de instrucciones logisticas.

### Seguridad, prevencion y mantenimiento

Preguntas clave:

- Hay partes de mantenimiento?
- Se registran paradas y averias?
- Hay calendario preventivo?
- Hay manuales digitales?
- Se registran incidentes de seguridad?

IA aplicable:

- Asistente de mantenimiento.
- Resumen de averias.
- Alertas preventivas.
- Analisis de incidencias.
- Generacion de checklists de seguridad.

### Recursos humanos y formacion

Preguntas clave:

- Como aprende una persona nueva?
- Hay procedimientos escritos?
- Que tareas dependen de una sola persona?
- Donde se pierde mas tiempo preguntando?

IA aplicable:

- Manual interno vivo.
- Onboarding por rol.
- Preguntas frecuentes internas.
- Procedimientos guiados.

### Marketing y ventas

La parte de marketing tambien es importante, pero en esta auditoria no deberia ser el primer foco si el objetivo principal es optimizar funcionamiento interno.

Oportunidades:

- Reutilizar proyectos reales como casos de estudio.
- Crear contenido tecnico para arquitectos/interioristas.
- Automatizar email marketing.
- Segmentar leads por tipo de cliente.
- Generar propuestas comerciales mas profesionales.
- Resumir conversaciones y oportunidades en CRM.

IA aplicable:

- Generacion de contenidos.
- Personalizacion de emails.
- Segmentacion de leads.
- Generador de propuestas.
- Asistente comercial multidioma.

## Mapa de procesos a auditar

### Proceso 1 - Entrada de oportunidad

Canales:

- Comercial.
- Email.
- Web.
- Telefono.
- WhatsApp.
- Cliente recurrente.
- Ferias/eventos.
- Redes sociales.

Datos a capturar:

- Cliente.
- Tipo de cliente.
- Pais.
- Idioma.
- Producto/material.
- Medidas/cantidad.
- Acabado.
- Fecha objetivo.
- Uso/aplicacion.
- Transporte.
- Datos fiscales.
- Documentos adjuntos.
- Urgencia.

Indicadores:

- Numero de solicitudes por canal.
- Tiempo de primera respuesta.
- % solicitudes con datos completos.
- % solicitudes que llegan a presupuesto.
- % presupuestos ganados.

### Proceso 2 - Presupuesto

Preguntas:

- Quien lo prepara?
- Cuanto tarda?
- Que datos necesita?
- Donde se consultan precios, stock y transporte?
- Hay plantillas?
- Se revisa margen?
- Se registra motivo de perdida?

Automatizacion posible:

- Borrador de presupuesto.
- Checklist de datos faltantes.
- Sugerencia de materiales alternativos.
- Validacion de margen minimo.
- Respuesta automatica al cliente.

### Proceso 3 - Pedido confirmado

Preguntas:

- Como se convierte un presupuesto en pedido?
- Que cambia entre ambos documentos?
- Quien valida condiciones?
- Como se comunica a produccion?
- Se reserva stock?

Automatizacion posible:

- Conversion presupuesto -> pedido.
- Reserva automatica o asistida de material.
- Generacion de orden de produccion.
- Aviso a compras/stock si falta material.

### Proceso 4 - Orden de produccion

Preguntas:

- Que informacion necesita produccion?
- Hay dibujos, medidas, acabados, tolerancias, embalaje?
- Como se prioriza?
- Como se reporta avance?
- Se registran incidencias?

Automatizacion posible:

- Orden de produccion normalizada.
- Checklist por tipo de trabajo.
- Resumen diario de carga.
- Alertas de retraso.

### Proceso 5 - Produccion y maquina

Preguntas:

- Que maquinas intervienen?
- Que datos generan?
- Hay partes manuales?
- Se registran paradas?
- Hay datos por lote/material?
- Se mide merma?

Automatizacion posible:

- Colector de datos.
- Dashboard de produccion.
- Deteccion de anomalas.
- Reporte automatico de turno/dia.

### Proceso 6 - Control de calidad

Preguntas:

- Que se revisa?
- Quien aprueba?
- Se registran fotos?
- Que pasa si hay defecto?
- Se conecta con reclamaciones?

Automatizacion posible:

- Formularios moviles.
- Registro fotografico.
- Clasificacion de defectos.
- Informe de calidad por pedido.

### Proceso 7 - Albaran, factura y cobro

Preguntas:

- Cuando se emite albaran?
- Cuando se factura?
- Quien lo hace?
- Que errores aparecen?
- Se controla cobro?
- Hay facturas rectificativas?

Automatizacion posible:

- Albaran desde pedido expedido.
- Factura desde albaran validado.
- Revision de datos fiscales.
- Alertas de cobro.

## Backlog inicial de herramientas de IA

| Herramienta | Descripcion | Fase recomendada |
|---|---|---|
| Bandeja inteligente de solicitudes | Clasifica emails/formularios y extrae datos | Fase 1 |
| Generador de borradores de respuesta | Propone respuestas segun contexto y datos faltantes | Fase 1 |
| Extractor de pedidos desde email/PDF | Convierte solicitudes en datos estructurados | Fase 1 |
| Generador documental | Presupuesto, pedido, orden, albaran y factura desde datos comunes | Fase 1-2 |
| Asistente interno | Responde con documentos internos, fichas, procesos y manuales | Fase 1-2 |
| Lector de informes solares | Resume rendimiento, ahorro y anomalas | Fase 1 |
| Dashboard operativo | Ventas, produccion, stock, energia y facturacion | Fase 2 |
| Colector SIMEC | Captura datos crudos de maquina y los normaliza | Fase 2 |
| Analizador de rendimiento | Mermas, paradas, m2, productividad, retrasos | Fase 2-3 |
| Recomendador de stock/material | Sugiere materiales disponibles para pedidos | Fase 3 |
| Analizador de reclamaciones | Causa raiz y coste de no calidad | Fase 3 |
| Vision artificial de calidad | Deteccion o asistencia en defectos visuales | Fase 4 |

## Roadmap recomendado

### Fase 0 - Preparacion de auditoria

Duracion: 3-5 dias.

Objetivo:

Preparar entrevistas, pedir datos y entender sistemas.

Acciones:

- Solicitar acceso o capturas de Odoo.
- Pedir ejemplos anonimizados de documentos.
- Pedir 5-10 pedidos reales completos.
- Pedir ejemplos de emails de clientes.
- Identificar responsables de ventas, administracion, produccion, compras y finanzas.
- Localizar servidor SIMEC y plataforma solar.

Entregable:

- Plan de auditoria y lista de informacion pendiente.

### Fase 1 - Auditoria operativa y quick wins

Duracion: 2-3 semanas.

Objetivo:

Mapear procesos reales y lanzar automatizaciones de bajo riesgo.

Acciones:

- Seguir pedidos reales de punta a punta.
- Medir tiempos y puntos de friccion.
- Revisar configuracion de Odoo.
- Auditar email y documentos.
- Crear primer prototipo de clasificacion de solicitudes.
- Crear resumen automatico de informes solares si hay datos disponibles.

Entregables:

- Mapa de procesos.
- Matriz de oportunidades.
- Backlog priorizado.
- Prototipo de bandeja inteligente.
- Prototipo de informe solar.

### Fase 2 - Automatizacion documental y Odoo

Duracion: 4-8 semanas.

Objetivo:

Reducir trabajo manual en presupuesto, pedido, orden de produccion, factura y albaran.

Acciones:

- Definir modelo de datos.
- Normalizar plantillas.
- Conectar formularios/email con Odoo.
- Crear flujo de validacion humana.
- Automatizar documentos.
- Crear dashboard de estado de pedidos.

Entregables:

- Flujo semiautomatico presupuesto -> pedido -> produccion -> factura/albaran.
- Reglas de validacion.
- Dashboard operativo basico.

### Fase 3 - Produccion, SIMEC y trazabilidad

Duracion: 2-4 meses.

Objetivo:

Capturar datos industriales y conectarlos con pedido, lote, maquina y rendimiento.

Acciones:

- Resolver captura de datos SIMEC.
- Crear diccionario de datos de maquina.
- Integrar partes de produccion.
- Registrar merma y paradas.
- Vincular lote/material/pedido.
- Crear reportes diarios/semanales.

Entregables:

- Colector de datos SIMEC.
- Dashboard de produccion.
- Reporte de rendimiento por maquina/material.
- Primer analisis de merma y paradas.

### Fase 4 - Optimizacion avanzada

Duracion: 6-12 meses.

Objetivo:

Pasar de automatizar tareas a optimizar decisiones.

Acciones:

- Prediccion de retrasos.
- Mantenimiento preventivo.
- Vision artificial para calidad.
- Recomendacion de compras.
- Optimizacion de planificacion.
- Analisis de margen real por cliente/material/pedido.

Entregables:

- Modelos predictivos.
- Alertas operativas.
- Recomendaciones de planificacion.
- Sistema de mejora continua.

## Arquitectura recomendada

Principio:

Odoo debe ser la fuente de verdad siempre que el plan contratado lo permita.

Arquitectura conceptual:

1. Fuentes de entrada:
   - Email.
   - Web/formularios.
   - Comerciales.
   - Documentos PDF/Excel.
   - SIMEC/maquinas.
   - Plataforma solar.
   - Stock/compras.

2. Capa de captura:
   - Conectores.
   - Lectores de documentos.
   - Colector local para maquinas.
   - Formularios estructurados.

3. Capa de normalizacion:
   - Limpieza de datos.
   - Diccionarios de campos.
   - Identificadores unicos.
   - Validacion de reglas.

4. Sistema central:
   - Odoo CRM/ventas/compras/inventario/produccion/facturacion.

5. Capa IA:
   - Clasificacion.
   - Extraccion.
   - Resumen.
   - Recomendacion.
   - Deteccion de anomalas.
   - Asistente interno.

6. Capa de decision:
   - Dashboards.
   - Alertas.
   - Informes automaticos.
   - Listas de accion.

## Datos que hay que pedir

### Documentos

- Presupuestos reales.
- Pedidos reales.
- Ordenes de produccion.
- Facturas.
- Albaranes.
- Packing lists.
- Plantillas comerciales.
- Tarifas.
- Fichas tecnicas.
- Manuales de maquina.
- Informes solares.
- Partes de produccion.
- Partes de mantenimiento.
- Reclamaciones.

### Sistemas

- Odoo: plan, modulos, partner, entorno y acceso.
- Email: proveedor, volumen, buzones compartidos.
- Web/formularios: WordPress/WooCommerce u otro sistema.
- SIMEC: modelo, software, servidor, logs, protocolo.
- Energia solar: plataforma, informes, API o emails.
- Contabilidad/facturacion previa.
- Almacenamiento de archivos: carpetas, Drive, servidor local, NAS.

### Metricas

- Solicitudes mensuales.
- Presupuestos mensuales.
- Tasa de aceptacion.
- Tiempo medio de respuesta.
- Facturas mensuales.
- Pedidos en produccion.
- m2 producidos.
- Merma.
- Reclamaciones.
- Retrasos.
- Stock disponible.
- Consumo energetico.
- Produccion solar.

## Preguntas para entrevistas

### Dueno / direccion

1. Cual es el principal cuello de botella actual?
2. Donde cree que se pierde mas dinero?
3. Que tareas dependen demasiado de una persona?
4. Que procesos le gustaria poder ver en un dashboard?
5. Que decisiones se toman hoy por intuicion?
6. Que espera de Odoo?
7. Que areas no quiere tocar todavia?
8. Que seria un exito visible en 60 dias?

### Administracion / facturacion

1. Que documentos se generan manualmente?
2. Cuanto tiempo lleva facturar?
3. Que errores se repiten?
4. Que datos faltan con frecuencia?
5. Que informacion se copia entre sistemas?
6. Que tareas son mas repetitivas?

### Ventas / comerciales

1. Por donde entran las solicitudes?
2. Que datos faltan normalmente para presupuestar?
3. Como se calcula un presupuesto?
4. Como se hace seguimiento?
5. Por que se pierden presupuestos?
6. Que respuestas se repiten mas?

### Produccion

1. Como llega una orden de produccion?
2. Que informacion falta o llega mal?
3. Como se priorizan trabajos?
4. Como se reportan avances?
5. Que maquinas generan datos?
6. Donde se producen mas paradas o esperas?
7. Como se mide merma?

### Compras / almacen

1. Como se decide que bloques/tablas comprar?
2. Como se registra el stock?
3. Como se reservan materiales para pedidos?
4. Que materiales rotan peor?
5. Que proveedores dan mejor rendimiento?
6. Como se gestionan defectos o reclamaciones a proveedor?

### Mantenimiento / IT

1. Que servidor recibe datos de SIMEC?
2. Que software hay instalado?
3. Hay copias de seguridad?
4. Que protocolos o puertos usa la maquina?
5. Quien tiene credenciales?
6. Hay restricciones de red industrial?
7. Que otros equipos generan datos?

## Criterios de priorizacion

Cada oportunidad debe puntuarse de 1 a 5 en:

- Ahorro de tiempo.
- Reduccion de errores.
- Impacto economico.
- Facilidad tecnica.
- Friccion con empleados.
- Disponibilidad de datos.
- Dependencia de terceros.
- Riesgo operativo.
- Velocidad para demostrar valor.

Regla practica:

Empezar por oportunidades con alto impacto, baja friccion y datos disponibles. Dejar para despues las que requieran cambios culturales fuertes o integraciones industriales complejas.

## Riesgos y precauciones

### Riesgo 1 - Automatizar sin entender el proceso

Si se automatiza un flujo mal definido, se pueden multiplicar errores. Primero mapear, despues automatizar.

### Riesgo 2 - Construir fuera de Odoo

Si Odoo va a ser el ERP/CRM, crear herramientas paralelas sin integracion puede generar otro silo.

### Riesgo 3 - Prometer IA industrial demasiado pronto

Prediccion, vision artificial y mantenimiento predictivo son potentes, pero necesitan datos fiables. Primero captura y reporting.

### Riesgo 4 - Resistencia del equipo

La IA debe presentarse como ayuda para quitar trabajo repetitivo, no como mecanismo de vigilancia.

### Riesgo 5 - Ciberseguridad industrial

No conectar maquinas industriales a internet sin una arquitectura segura. Separar red industrial, capturar localmente y revisar permisos.

### Riesgo 6 - Facturacion y cumplimiento

Facturacion, VERI*FACTU e impuestos deben validarse con asesor/partner Odoo.

## Mensaje recomendado para empleados

No plantear el proyecto como "vamos a meter IA para controlar". Plantearlo asi:

"Queremos entender que tareas os hacen perder mas tiempo, donde se repiten errores y que informacion os falta para trabajar mas comodos. La idea es que la tecnologia prepare borradores, ordene datos y quite trabajo repetitivo, pero las decisiones importantes seguiran pasando por personas."

## Primer piloto recomendado

### Piloto 1 - Bandeja inteligente + documentos

Objetivo:

Reducir tiempo administrativo y mejorar entrada de pedidos.

Alcance:

- Leer emails/formularios.
- Clasificar solicitud.
- Extraer datos.
- Detectar datos faltantes.
- Crear borrador de respuesta.
- Preparar borrador de oportunidad/presupuesto en Odoo o formato intermedio.

Duracion:

4-6 semanas.

Metricas:

- Tiempo medio de clasificacion.
- Tiempo de primera respuesta.
- % solicitudes con datos estructurados.
- Errores evitados.
- Horas ahorradas por semana.

### Piloto 2 - Informe solar automatico

Objetivo:

Demostrar valor rapido con una tarea concreta de interpretacion de datos.

Alcance:

- Capturar informe/email/API.
- Extraer datos.
- Generar resumen mensual.
- Detectar anomalas.
- Enviar informe a direccion.

Duracion:

1-2 semanas si los datos son accesibles.

### Piloto 3 - Diagnostico SIMEC

Objetivo:

Saber exactamente que datos genera la maquina y por que no se estan usando.

Alcance:

- Inventario tecnico.
- Acceso a servidor.
- Captura de logs/datos crudos.
- Diccionario de campos.
- Mini-dashboard de prueba.

Duracion:

2-4 semanas, segun acceso y documentacion.

## Entregables de la auditoria formal

1. Mapa completo de procesos internos.
2. Mapa de sistemas y flujos de datos.
3. Diagnostico de Odoo y recomendaciones de configuracion/integracion.
4. Matriz de oportunidades IA/automatizacion.
5. Backlog priorizado por impacto, friccion y coste.
6. Roadmap 30/60/90 dias.
7. Propuesta de pilotos.
8. Requisitos tecnicos y de seguridad.
9. Estimacion de ROI por area.
10. Riesgos y dependencias.

## Hipotesis final

La mayor oportunidad inmediata no esta en crear una IA espectacular, sino en ordenar la operativa diaria:

- Entradas de solicitud.
- Documentos.
- Odoo.
- Facturacion.
- Stock.
- Produccion.
- Reporting.

Si esa base queda bien construida, despues se podran crear herramientas mas avanzadas: prediccion de retrasos, mantenimiento preventivo, recomendacion de compras, vision artificial de calidad y optimizacion de margen.

La estrategia mas sana es:

1. Empezar por tareas administrativas y documentales de baja friccion.
2. Usar Odoo como eje.
3. Resolver trazabilidad y datos de produccion.
4. Integrar SIMEC y energia.
5. Convertir los datos en indicadores de gestion.
6. Escalar hacia IA industrial cuando haya datos suficientes.

## Siguiente paso practico

Preparar una visita o reunion de auditoria de 2-4 horas con direccion y responsables de administracion, ventas, produccion, compras/almacen e IT/mantenimiento.

Objetivo de esa reunion:

- Validar este mapa.
- Confirmar sistema Odoo contratado.
- Ver 5 pedidos reales completos.
- Identificar 3 tareas repetitivas de alto impacto.
- Elegir el primer piloto.

Recomendacion de primer piloto:

Bandeja inteligente de solicitudes + generacion documental asistida, porque toca el flujo central de la empresa, aporta valor rapido y no exige entrar todavia en automatizacion industrial compleja.
