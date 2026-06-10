# Pulycort - Pre-auditoría de procesos internos e integración de IA

Fecha: 2026-06-08

## Objetivo

Preparar una pre-auditoría para identificar donde puede aportar más valor la IA y la automatización dentro de Pulycort, con foco en agilidad operativa, reducción de costes, mejora de comodidad para el equipo, trazabilidad, productividad industrial y mejor toma de decisiones.

El objetivo no es "meter IA" de forma genérica. El objetivo es entender los procesos reales de la empresa, detectar tareas repetitivas o mal conectadas, ordenar los datos y construir herramientas que reduzcan trabajo manual, errores, tiempos de respuesta y dependencia de conocimiento informal.

## Nota de alcance

Este documento parte de:

- Conversaciones iniciales con el dueño.
- Información pública de la web de Pulycort.
- Hipótesis razonables sobre una fábrica de mármol y piedra natural.
- Información pública sobre Odoo, SIMEC y obligaciones de facturación en España.

No sustituye a la auditoría en planta. Muchas oportunidades dependen de datos que todavía hay que validar: sistema Odoo contratado, volumen de pedidos, flujo documental real, formatos de datos de máquinas, responsables internos, tiempos, errores, costes y prioridades del negocio.

## Fuentes públicas revisadas

- Web principal: https://pulycort.com/
- Proceso de Pulycort: https://pulycort.com/proceso/
- Fabricación española: https://pulycort.com/fabricación-española/
- Producto Crema Marfil: https://pulycort.com/producto-crema-marfil/
- Odoo External RPC API: https://www.odoo.com/documentation/19.0/th/developer/reference/external_rpc_api.html
- Odoo.sh FAQ: https://www.odoo.sh/faq
- AEAT - VERI*FACTU: https://sede.agenciatributaria.gob.es/Sede/procedimientos/IZ86.shtml
- AEAT - Facturación electrónica obligatoria: https://sede.agenciatributaria.gob.es/Sede/todas-noticias/2026/marzo/31/facturacion-electronica-obligatoria.html
- SIMEC, maquinaria para piedra natural: https://www.simec.it/

## Resumen ejecutivo

Pulycort tiene un escenario muy favorable para aplicar IA porque combina tres capas de actividad:

1. Actividad comercial con mucho documento, email, presupuestos, pedidos y seguimiento.
2. Actividad industrial con máquinas, bloques, tablas, cortes, acabados, mermas, tiempos y rendimiento.
3. Actividad administrativa con facturas, albaranes, compras, stock, logística, informes y reporting.

La mayor oportunidad inicial está en conectar y automatizar el flujo:

Lead o solicitud -> presupuesto -> pedido -> orden de producción -> fabricación -> control de calidad -> albarán -> factura -> seguimiento.

Si ese flujo queda bien modelado en Odoo y apoyado por IA, la empresa puede reducir mucho trabajo manual, evitar doble entrada de datos y ganar visibilidad real sobre márgenes, plazos, productividad y problemas.

La recomendación inicial es avanzar en tres niveles:

1. Quick wins de baja fricción: email inteligente, extraccion de datos, borradores de respuesta, resumen de informes solares, documentación automática y asistente interno.
2. Core operativo: Odoo bien modelado, automatización de documentos, facturación asistida, CRM/pedidos/producción integrados y trazabilidad de lotes.
3. Inteligencia industrial: SIMEC, datos de máquina, rendimiento, mermas, mantenimiento, calidad, energía y planificacion.

## Diagnóstico inicial del negocio

Según la información pública, Pulycort no es solo una comercializadora. Es una empresa industrial de piedra natural con fabricación, transformación, acabados, control de calidad, embalaje y envío. Esto es importante porque la IA puede aportar valor en toda la cadena, no solo en marketing.

Áreas visibles del negocio:

- Selección y compra de bloques/tablas de mármol y piedra natural.
- Transformación de bloques en tablas o piezas.
- Acabados: pulido, apomazado, abujardado, arenado, cuero/leather y otros.
- Fabricación a medida.
- Control de calidad.
- Embalaje y envío nacional/internacional.
- Venta B2B y posiblemente B2C.
- Contenido comercial, web, tienda, blog, redes, formularios y captación digital.

Áreas internas probables:

- Recepcion de solicitudes por comercial, email, web, llamadas, WhatsApp o clientes recurrentes.
- Elaboracion manual o semimanual de presupuestos.
- Generación de pedidos, ordenes de producción, albaranes y facturas.
- Compras de materia prima.
- Gestión de stock.
- Planificacion de máquina y personal.
- Partes de producción.
- Seguimiento de incidencias, reclamaciones, roturas, retrasos o defectos.
- Control financiero, cobros, pagos y márgenes.

## Principio clave de la auditoría

Antes de construir herramientas de IA, hay que localizar donde se pierde tiempo o dinero por:

- Doble entrada de datos.
- Emails sin clasificar.
- Información que vive en la cabeza de una persona.
- Documentos generados a mano.
- Excel sueltos.
- Falta de trazabilidad entre presupuesto, pedido, producción, albarán y factura.
- Datos de máquina que existen pero no se aprovechan.
- Stock poco fiable.
- Informes que alguien interpreta manualmente.
- Decisiones tomadas sin indicadores.

La IA será útil si se apoya en procesos claros y datos ordenados. Si el proceso esta roto, la IA solo hara más rápido el desorden.

## Prioridades recomendadas

| Prioridad | Área | Impacto | Fricción | Motivo |
|---|---|---:|---:|---|
| 1 | Flujo pedido-documentos-Odoo | Muy alto | Media | Es el centro operativo de la empresa |
| 2 | Email y entrada de solicitudes | Alto | Baja | Mucho volumen, fácil demostrar valor |
| 3 | Facturación y albaranes | Alto | Media | Hay trabajo manual claro y riesgo de errores |
| 4 | Datos de producción y SIMEC | Alto | Media-alta | Puede desbloquear productividad y rendimiento |
| 5 | Compras, stock y trazabilidad | Alto | Media | Afecta margen, plazos y servicio |
| 6 | Reporting de energía/placas solares | Medio | Baja | Quick win perfecto y poco invasivo |
| 7 | Asistente interno documental | Medio-alto | Baja | Reduce dependencia de personas clave |
| 8 | Marketing, contenidos y CRM | Medio | Baja-media | Útil, pero no debe tapar el core operativo |
| 9 | Visión artificial/calidad | Alto | Alta | Potente, pero requiere datos e imagenes etiquetadas |

## Donde habrá más retorno con menos fricción

### 1. Email inteligente y clasificacion de solicitudes

Problema probable:

Llegan pedidos y consultas por multiples vias: comerciales, email, web, clientes recurrentes, llamadas o WhatsApp. Parte de la información llega desordenada, incompleta o en distintos idiomas.

Oportunidad:

Crear una bandeja inteligente que lea emails y formularios, clasifique cada mensaje y extraiga datos clave:

- Cliente.
- País/idioma.
- Tipo de solicitud.
- Material.
- Formato.
- Medidas.
- Grosor.
- Acabado.
- Cantidad.
- Fecha deseada.
- Dirección de envío.
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

Por qué tiene poca fricción:

No cambia radicalmente el trabajo del empleado. Le da una bandeja más ordenada y borradores que puede validar.

Riesgo:

No automatizar el envío sin revisión humana al principio. La IA debe preparar, no decidir sola.

### 2. Generación documental desde una única fuente de verdad

Problema probable:

Para un mismo pedido se generan varios documentos: presupuesto, pedido, orden de producción, factura y albarán. Si cada documento se crea manualmente o copiando datos, aparecen errores y pérdida de tiempo.

Oportunidad:

Crear un flujo donde los datos se introduzcan una vez y se reutilicen:

1. Solicitud del cliente.
2. Presupuesto.
3. Confirmacion de pedido.
4. Orden de producción.
5. Albarán.
6. Factura.
7. Documentación logística o comercial adicional.

IA aplicable:

- Transformar emails en borradores de presupuesto.
- Generar orden de producción con instrucciones claras.
- Revisar inconsistencias entre documentos.
- Preparar factura/albarán desde pedido confirmado.
- Traducir documentos comerciales.
- Generar descripciones técnicas normalizadas.

Por qué tiene alto retorno:

Reduce errores, tiempos administrativos y dependencia de una persona. También mejora la trazabilidad.

Punto clave:

Esto debería apoyarse en Odoo. No conviene crear un sistema paralelo si Odoo ya va a ser el ERP/CRM.

### 3. Facturación manual

Problema probable:

Si las facturas se generan manualmente por una persona, hay coste directo, riesgo de error y dependencia operativa.

Oportunidad:

Automatizar o semiautomatizar la factura a partir del pedido/albarán validado, con revisión humana en excepciones.

IA aplicable:

- Validación de datos antes de facturar.
- Deteccion de inconsistencias: cliente, CIF/VAT, dirección, importes, impuestos, condiciones, moneda, incoterm.
- Generación de borrador.
- Resumen de facturas pendientes.
- Reconciliación simple con pedidos/albaranes.

Importante:

Hay que revisar con asesor/partner Odoo las obligaciones de facturación en España, VERI*FACTU y facturación electrónica B2B. No debe tratarse como un detalle técnico menor.

### 4. Informes de placas solares y energía

Problema:

Si alguien dedica tiempo a interpretar informes de rendimiento solar, probablemente es una tarea repetitiva con retorno claro para automatizar.

Oportunidad:

Crear un lector automático de informes o conectar con la plataforma del inversor/instalador para generar un resumen mensual:

- Producción solar.
- Consumo total.
- Autoconsumo.
- Excedentes.
- Ahorro estimado.
- Desviacion frente a esperado.
- Días anormales.
- Relación entre consumo y producción industrial.

IA aplicable:

- Lectura de PDFs o emails.
- Resumen ejecutivo.
- Deteccion de anomalas.
- Generación de informe mensual.

Por qué es buen quick win:

Es poco sensible, poco invasivo y demuestra valor rápidamente.

### 5. Asistente interno de conocimiento

Problema:

En empresas industriales suele haber mucho conocimiento distribuido en personas, manuales, PDFs, emails antiguos, fichas técnicas, tarifas, normas internas y procedimientos.

Oportunidad:

Crear un asistente interno que responda preguntas como:

- Que acabado se recomienda para exterior?
- Como se prepara una orden de producción?
- Que datos necesita un presupuesto?
- Que hacer si una máquina reporta un error?
- Que condiciones comerciales aplicar a cierto tipo de cliente?
- Como embalar cierto formato?
- Como se clasifica un material?

IA aplicable:

- Búsqueda semántica en documentos internos.
- Respuestas con fuentes.
- Procedimientos paso a paso.
- Resumen de manuales de máquina.
- Traducción y adaptacion de fichas técnicas.

Por qué tiene baja fricción:

Ayuda al empleado sin sustituir su criterio. Es especialmente útil para incorporar gente nueva o evitar interrupciones constantes.

## Donde esta el mayor retorno estratégico

### 1. Odoo como columna vertebral

La compra de Odoo es una oportunidad enorme, pero también un riesgo si se configura sin pensar en el proceso industrial real.

Odoo no debe ser solo "un CRM adaptado". Debería convertirse en la fuente principal de:

- Clientes.
- Oportunidades.
- Presupuestos.
- Pedidos.
- Producción.
- Compras.
- Stock.
- Facturas.
- Albaranes.
- Trazabilidad.
- Reporting.

Primera pregunta crítica:

Que Odoo han contratado?

Opciones posibles:

- Odoo Online Standard.
- Odoo Online Custom.
- Odoo.sh.
- Instalación on-premise.
- Partner con desarrollos propios.

Por qué importa:

Según la documentación oficial de Odoo, el acceso por API externa y la personalizacion dependen del plan y del entorno. Si tienen un plan limitado, algunas integraciones profundas pueden requerir cambio de plan, partner o arquitectura alternativa.

Preguntas para el partner Odoo:

1. Que plan exacto tiene Pulycort?
2. Hay acceso a API externa?
3. Se pueden crear módulos personalizados?
4. Se puede conectar con email, web, máquinas y documentos?
5. Que módulos se han comprado o activado?
6. Como se modelara la producción?
7. Como se modelaran bloques, tablas, lotes, acabados y formatos?
8. Como se gestionara stock reservado vs disponible?
9. Como se generaran factura y albarán?
10. Que restricciones hay para automatizaciones externas?

Recomendación:

No desarrollar una herramienta paralela hasta saber el alcance real de Odoo. La IA debe integrarse con Odoo siempre que sea viable.

### 2. Trazabilidad bloque-tabla-pedido-cliente

En una fábrica de mármol, la trazabilidad puede tener mucho valor económico.

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
- Coste de transformación.
- Pedido asociado.
- Cliente.
- Mermas.
- Reclamaciones.

Oportunidad:

Saber que bloques, materiales, proveedores y acabados generan mejor rendimiento real, menos incidencias y mejor margen.

IA aplicable:

- Clasificacion asistida con fotos.
- Búsqueda visual de tablas.
- Recomendación de stock para un pedido.
- Deteccion de patrones de merma o reclamaciones.
- Resumen de rendimiento por proveedor/material.

Condicion previa:

Codificación clara de lotes y stock. Sin identificadores consistentes, la IA tendrá poco donde apoyarse.

### 3. Producción, máquinas y rendimiento

Los datos de producción pueden convertirse en una ventaja real si se capturan bien.

Métricas relevantes:

- m2 producidos por dia/turno/máquina.
- Tiempo de corte.
- Tiempo de parada.
- Causa de parada.
- Rendimiento por bloque.
- Merma por material/acabado/grosor.
- Reprocesos.
- Consumo energético.
- Incidencias.
- Cumplimiento de fecha prometida.
- Productividad por tipo de trabajo.

IA aplicable:

- Deteccion de anomalas.
- Predicción de retrasos.
- Clasificacion de causas de parada.
- Recomendaciones de planificacion.
- Alertas de bajo rendimiento.
- Resumen diario de producción.

Error a evitar:

Empezar por predicción avanzada sin datos fiables. Primero hay que capturar, limpiar y visualizar.

### 4. SIMEC y servidor interno

Se ha mencionado una máquina SIMEC, probablemente un telar o equipo de corte, que envía datos a un servidor interno. Hay un problema: no llegan los datos, no se pueden interpretar o no se están explotando.

Hipótesis posibles:

- La máquina si envía datos, pero nadie sabe leer el formato.
- El servidor recibe archivos, pero no están documentados.
- Hay una base de datos local sin credenciales claras.
- Los timestamps o codificaciones están mal.
- El software del fabricante requiere licencia.
- La red industrial bloquea el acceso.
- El protocolo no es estándar o no se ha conectado bien.
- Se están generando logs, pero no se integran con ningun sistema.

Auditoría técnica SIMEC:

1. Identificar modelo exacto de máquina.
2. Identificar software instalado.
3. Revisar PLC/HMI y documentación.
4. Localizar servidor interno.
5. Revisar carpetas, logs, bases de datos, servicios y puertos.
6. Ver si exporta CSV, XML, SQL, API, OPC-UA, Modbus, FTP u otro protocolo.
7. Capturar datos crudos antes de transformarlos.
8. Crear diccionario de campos.
9. Comparar datos de máquina con partes reales de producción.
10. Definir integración con Odoo o dashboard intermedio.

Recomendación:

Crear primero un "colector edge" en red local que guarde una copia de datos crudos. Después se transforma y se envía a Odoo/dashboard. No tocar controles de máquina ni red industrial sin apoyo técnico adecuado.

## Áreas adicionales que conviene auditar

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
- Deteccion de materiales con baja rotación.
- Recomendación de compra basada en demanda historica.

### Stock y disponibilidad real

Preguntas clave:

- El stock en sistema coincide con el stock fisico?
- Se distingue disponible, reservado, defectuoso y en transformación?
- Hay fotos asociadas a cada tabla/lote?
- Se puede saber rápidamente si un pedido es fabricable?

IA aplicable:

- Búsqueda asistida de material disponible.
- Respuesta rápida a comerciales.
- Deteccion de incoherencias en stock.
- Resumen de stock lento u obsoleto.

### Calidad, incidencias y reclamaciones

Preguntas clave:

- Se registran defectos?
- Se fotografian?
- Se vinculan a pedido, lote, máquina y proveedor?
- Se clasifican causas?
- Se mide coste de no calidad?

IA aplicable:

- Clasificacion de defectos desde texto/foto.
- Resumen de reclamaciones.
- Análisis de causa raiz.
- Priorizacion de acciones correctivas.

### Logística y exportacion

Preguntas clave:

- Que documentos se preparan para envío?
- Hay Incoterms?
- Se generan packing lists?
- Hay seguros, aduanas, certificados o instrucciones por país?
- Donde se producen errores o retrasos?

IA aplicable:

- Checklist documental por país/tipo de envío.
- Generación de borradores.
- Deteccion de datos faltantes.
- Traducción de instrucciones logisticas.

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
- Análisis de incidencias.
- Generación de checklists de seguridad.

### Recursos humanos y formacion

Preguntas clave:

- Como aprende una persona nueva?
- Hay procedimientos escritos?
- Que tareas dependen de una sola persona?
- Donde se pierde más tiempo preguntando?

IA aplicable:

- Manual interno vivo.
- Onboarding por rol.
- Preguntas frecuentes internas.
- Procedimientos guiados.

### Marketing y ventas

La parte de marketing también es importante, pero en esta auditoría no debería ser el primer foco si el objetivo principal es optimizar funcionamiento interno.

Oportunidades:

- Reutilizar proyectos reales como casos de estudio.
- Crear contenido técnico para arquitectos/interioristas.
- Automatizar email marketing.
- Segmentar leads por tipo de cliente.
- Generar propuestas comerciales más profesionales.
- Resumir conversaciones y oportunidades en CRM.

IA aplicable:

- Generación de contenidos.
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
- Teléfono.
- WhatsApp.
- Cliente recurrente.
- Ferias/eventos.
- Redes sociales.

Datos a capturar:

- Cliente.
- Tipo de cliente.
- País.
- Idioma.
- Producto/material.
- Medidas/cantidad.
- Acabado.
- Fecha objetivo.
- Uso/aplicación.
- Transporte.
- Datos fiscales.
- Documentos adjuntos.
- Urgencia.

Indicadores:

- Número de solicitudes por canal.
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
- Se registra motivo de pérdida?

Automatización posible:

- Borrador de presupuesto.
- Checklist de datos faltantes.
- Sugerencia de materiales alternativos.
- Validación de margen mínimo.
- Respuesta automática al cliente.

### Proceso 3 - Pedido confirmado

Preguntas:

- Como se convierte un presupuesto en pedido?
- Que cambia entre ambos documentos?
- Quien valida condiciones?
- Como se comunica a producción?
- Se reserva stock?

Automatización posible:

- Conversión presupuesto -> pedido.
- Reserva automática o asistida de material.
- Generación de orden de producción.
- Aviso a compras/stock si falta material.

### Proceso 4 - Orden de producción

Preguntas:

- Que información necesita producción?
- Hay dibujos, medidas, acabados, tolerancias, embalaje?
- Como se prioriza?
- Como se reporta avance?
- Se registran incidencias?

Automatización posible:

- Orden de producción normalizada.
- Checklist por tipo de trabajo.
- Resumen diario de carga.
- Alertas de retraso.

### Proceso 5 - Producción y máquina

Preguntas:

- Que máquinas intervienen?
- Que datos generan?
- Hay partes manuales?
- Se registran paradas?
- Hay datos por lote/material?
- Se mide merma?

Automatización posible:

- Colector de datos.
- Dashboard de producción.
- Deteccion de anomalas.
- Reporte automático de turno/dia.

### Proceso 6 - Control de calidad

Preguntas:

- Que se revisa?
- Quien aprueba?
- Se registran fotos?
- Que pasa si hay defecto?
- Se conecta con reclamaciones?

Automatización posible:

- Formularios moviles.
- Registro fotografico.
- Clasificacion de defectos.
- Informe de calidad por pedido.

### Proceso 7 - Albarán, factura y cobro

Preguntas:

- Cuando se emite albarán?
- Cuando se factura?
- Quien lo hace?
- Que errores aparecen?
- Se controla cobro?
- Hay facturas rectificativas?

Automatización posible:

- Albarán desde pedido expedido.
- Factura desde albarán validado.
- Revisión de datos fiscales.
- Alertas de cobro.

## Backlog inicial de herramientas de IA

| Herramienta | Descripción | Fase recomendada |
|---|---|---|
| Bandeja inteligente de solicitudes | Clasifica emails/formularios y extrae datos | Fase 1 |
| Generador de borradores de respuesta | Propone respuestas según contexto y datos faltantes | Fase 1 |
| Extractor de pedidos desde email/PDF | Convierte solicitudes en datos estructurados | Fase 1 |
| Generador documental | Presupuesto, pedido, orden, albarán y factura desde datos comunes | Fase 1-2 |
| Asistente interno | Responde con documentos internos, fichas, procesos y manuales | Fase 1-2 |
| Lector de informes solares | Resume rendimiento, ahorro y anomalas | Fase 1 |
| Dashboard operativo | Ventas, producción, stock, energía y facturación | Fase 2 |
| Colector SIMEC | Captura datos crudos de máquina y los normaliza | Fase 2 |
| Analizador de rendimiento | Mermas, paradas, m2, productividad, retrasos | Fase 2-3 |
| Recomendador de stock/material | Sugiere materiales disponibles para pedidos | Fase 3 |
| Analizador de reclamaciones | Causa raiz y coste de no calidad | Fase 3 |
| Visión artificial de calidad | Deteccion o asistencia en defectos visuales | Fase 4 |

## Roadmap recomendado

### Fase 0 - Preparación de auditoría

Duracion: 3-5 días.

Objetivo:

Preparar entrevistas, pedir datos y entender sistemas.

Acciones:

- Solicitar acceso o capturas de Odoo.
- Pedir ejemplos anonimizados de documentos.
- Pedir 5-10 pedidos reales completos.
- Pedir ejemplos de emails de clientes.
- Identificar responsables de ventas, administracion, producción, compras y finanzas.
- Localizar servidor SIMEC y plataforma solar.

Entregable:

- Plan de auditoría y lista de información pendiente.

### Fase 1 - Auditoría operativa y quick wins

Duracion: 2-3 semanas.

Objetivo:

Mapear procesos reales y lanzar automatizaciones de bajo riesgo.

Acciones:

- Seguir pedidos reales de punta a punta.
- Medir tiempos y puntos de fricción.
- Revisar configuracion de Odoo.
- Auditar email y documentos.
- Crear primer prototipo de clasificacion de solicitudes.
- Crear resumen automático de informes solares si hay datos disponibles.

Entregables:

- Mapa de procesos.
- Matriz de oportunidades.
- Backlog priorizado.
- Prototipo de bandeja inteligente.
- Prototipo de informe solar.

### Fase 2 - Automatización documental y Odoo

Duracion: 4-8 semanas.

Objetivo:

Reducir trabajo manual en presupuesto, pedido, orden de producción, factura y albarán.

Acciones:

- Definir modelo de datos.
- Normalizar plantillas.
- Conectar formularios/email con Odoo.
- Crear flujo de validación humana.
- Automatizar documentos.
- Crear dashboard de estado de pedidos.

Entregables:

- Flujo semiautomático presupuesto -> pedido -> producción -> factura/albarán.
- Reglas de validación.
- Dashboard operativo basico.

### Fase 3 - Producción, SIMEC y trazabilidad

Duracion: 2-4 meses.

Objetivo:

Capturar datos industriales y conectarlos con pedido, lote, máquina y rendimiento.

Acciones:

- Resolver captura de datos SIMEC.
- Crear diccionario de datos de máquina.
- Integrar partes de producción.
- Registrar merma y paradas.
- Vincular lote/material/pedido.
- Crear reportes diarios/semanales.

Entregables:

- Colector de datos SIMEC.
- Dashboard de producción.
- Reporte de rendimiento por máquina/material.
- Primer análisis de merma y paradas.

### Fase 4 - Optimización avanzada

Duracion: 6-12 meses.

Objetivo:

Pasar de automatizar tareas a optimizar decisiones.

Acciones:

- Predicción de retrasos.
- Mantenimiento preventivo.
- Visión artificial para calidad.
- Recomendación de compras.
- Optimización de planificacion.
- Análisis de margen real por cliente/material/pedido.

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
   - SIMEC/máquinas.
   - Plataforma solar.
   - Stock/compras.

2. Capa de captura:
   - Conectores.
   - Lectores de documentos.
   - Colector local para máquinas.
   - Formularios estructurados.

3. Capa de normalizacion:
   - Limpieza de datos.
   - Diccionarios de campos.
   - Identificadores únicos.
   - Validación de reglas.

4. Sistema central:
   - Odoo CRM/ventas/compras/inventario/producción/facturación.

5. Capa IA:
   - Clasificacion.
   - Extraccion.
   - Resumen.
   - Recomendación.
   - Deteccion de anomalas.
   - Asistente interno.

6. Capa de decisión:
   - Dashboards.
   - Alertas.
   - Informes automáticos.
   - Listas de acción.

## Datos que hay que pedir

### Documentos

- Presupuestos reales.
- Pedidos reales.
- Ordenes de producción.
- Facturas.
- Albaranes.
- Packing lists.
- Plantillas comerciales.
- Tarifas.
- Fichas técnicas.
- Manuales de máquina.
- Informes solares.
- Partes de producción.
- Partes de mantenimiento.
- Reclamaciones.

### Sistemas

- Odoo: plan, módulos, partner, entorno y acceso.
- Email: proveedor, volumen, buzones compartidos.
- Web/formularios: WordPress/WooCommerce u otro sistema.
- SIMEC: modelo, software, servidor, logs, protocolo.
- Energía solar: plataforma, informes, API o emails.
- Contabilidad/facturación previa.
- Almacenamiento de archivos: carpetas, Drive, servidor local, NAS.

### Métricas

- Solicitudes mensuales.
- Presupuestos mensuales.
- Tasa de aceptacion.
- Tiempo medio de respuesta.
- Facturas mensuales.
- Pedidos en producción.
- m2 producidos.
- Merma.
- Reclamaciones.
- Retrasos.
- Stock disponible.
- Consumo energético.
- Producción solar.

## Preguntas para entrevistas

### Dueño / dirección

1. Cual es el principal cuello de botella actual?
2. Donde cree que se pierde más dinero?
3. Que tareas dependen demasiado de una persona?
4. Que procesos le gustaria poder ver en un dashboard?
5. Que decisiones se toman hoy por intuición?
6. Que espera de Odoo?
7. Que áreas no quiere tocar todavía?
8. Que sería un éxito visible en 60 días?

### Administracion / facturación

1. Que documentos se generan manualmente?
2. Cuanto tiempo lleva facturar?
3. Que errores se repiten?
4. Que datos faltan con frecuencia?
5. Que información se copia entre sistemas?
6. Que tareas son más repetitivas?

### Ventas / comerciales

1. Por donde entran las solicitudes?
2. Que datos faltan normalmente para presupuestar?
3. Como se calcula un presupuesto?
4. Como se hace seguimiento?
5. Por qué se pierden presupuestos?
6. Que respuestas se repiten más?

### Producción

1. Como llega una orden de producción?
2. Que información falta o llega mal?
3. Como se priorizan trabajos?
4. Como se reportan avances?
5. Que máquinas generan datos?
6. Donde se producen más paradas o esperas?
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
4. Que protocolos o puertos usa la máquina?
5. Quien tiene credenciales?
6. Hay restricciones de red industrial?
7. Que otros equipos generan datos?

## Criterios de priorizacion

Cada oportunidad debe puntuarse de 1 a 5 en:

- Ahorro de tiempo.
- Reducción de errores.
- Impacto económico.
- Facilidad técnica.
- Fricción con empleados.
- Disponibilidad de datos.
- Dependencia de terceros.
- Riesgo operativo.
- Velocidad para demostrar valor.

Regla práctica:

Empezar por oportunidades con alto impacto, baja fricción y datos disponibles. Dejar para después las que requieran cambios culturales fuertes o integraciones industriales complejas.

## Riesgos y precauciones

### Riesgo 1 - Automatizar sin entender el proceso

Si se automatiza un flujo mal definido, se pueden multiplicar errores. Primero mapear, después automatizar.

### Riesgo 2 - Construir fuera de Odoo

Si Odoo va a ser el ERP/CRM, crear herramientas paralelas sin integración puede generar otro silo.

### Riesgo 3 - Prometer IA industrial demasiado pronto

Predicción, visión artificial y mantenimiento predictivo son potentes, pero necesitan datos fiables. Primero captura y reporting.

### Riesgo 4 - Resistencia del equipo

La IA debe presentarse como ayuda para quitar trabajo repetitivo, no como mecanismo de vigilancia.

### Riesgo 5 - Ciberseguridad industrial

No conectar máquinas industriales a internet sin una arquitectura segura. Separar red industrial, capturar localmente y revisar permisos.

### Riesgo 6 - Facturación y cumplimiento

Facturación, VERI*FACTU e impuestos deben validarse con asesor/partner Odoo.

## Mensaje recomendado para empleados

No plantear el proyecto como "vamos a meter IA para controlar". Plantearlo asi:

"Queremos entender que tareas os hacen perder más tiempo, donde se repiten errores y que información os falta para trabajar más cómodos. La idea es que la tecnología prepare borradores, ordene datos y quite trabajo repetitivo, pero las decisiones importantes seguirán pasando por personas."

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

Métricas:

- Tiempo medio de clasificacion.
- Tiempo de primera respuesta.
- % solicitudes con datos estructurados.
- Errores evitados.
- Horas ahorradas por semana.

### Piloto 2 - Informe solar automático

Objetivo:

Demostrar valor rápido con una tarea concreta de interpretacion de datos.

Alcance:

- Capturar informe/email/API.
- Extraer datos.
- Generar resumen mensual.
- Detectar anomalas.
- Enviar informe a dirección.

Duracion:

1-2 semanas si los datos son accesibles.

### Piloto 3 - Diagnóstico SIMEC

Objetivo:

Saber exactamente que datos genera la máquina y por qué no se están usando.

Alcance:

- Inventario técnico.
- Acceso a servidor.
- Captura de logs/datos crudos.
- Diccionario de campos.
- Mini-dashboard de prueba.

Duracion:

2-4 semanas, según acceso y documentación.

## Entregables de la auditoría formal

1. Mapa completo de procesos internos.
2. Mapa de sistemas y flujos de datos.
3. Diagnóstico de Odoo y recomendaciones de configuracion/integración.
4. Matriz de oportunidades IA/automatización.
5. Backlog priorizado por impacto, fricción y coste.
6. Roadmap 30/60/90 días.
7. Propuesta de pilotos.
8. Requisitos técnicos y de seguridad.
9. Estimacion de ROI por área.
10. Riesgos y dependencias.

## Hipótesis final

La mayor oportunidad inmediata no esta en crear una IA espectacular, sino en ordenar la operativa diaria:

- Entradas de solicitud.
- Documentos.
- Odoo.
- Facturación.
- Stock.
- Producción.
- Reporting.

Si esa base queda bien construida, después se podrán crear herramientas más avanzadas: predicción de retrasos, mantenimiento preventivo, recomendación de compras, visión artificial de calidad y optimización de margen.

La estrategia más sana es:

1. Empezar por tareas administrativas y documentales de baja fricción.
2. Usar Odoo como eje.
3. Resolver trazabilidad y datos de producción.
4. Integrar SIMEC y energía.
5. Convertir los datos en indicadores de gestión.
6. Escalar hacia IA industrial cuando haya datos suficientes.

## Siguiente paso práctico

Preparar una visita o reunión de auditoría de 2-4 horas con dirección y responsables de administracion, ventas, producción, compras/almacen e IT/mantenimiento.

Objetivo de esa reunión:

- Validar este mapa.
- Confirmar sistema Odoo contratado.
- Ver 5 pedidos reales completos.
- Identificar 3 tareas repetitivas de alto impacto.
- Elegir el primer piloto.

Recomendación de primer piloto:

Bandeja inteligente de solicitudes + generación documental asistida, porque toca el flujo central de la empresa, aporta valor rápido y no exige entrar todavía en automatización industrial compleja.
