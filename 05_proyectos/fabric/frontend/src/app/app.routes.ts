import { Routes } from '@angular/router';
import { SeccionLayoutComponent } from './shared/seccion-layout.component';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'telares' },

  // Máquinas — sección sin sub-pestañas (la lista desplegable de telares).
  {
    path: 'telares',
    loadComponent: () =>
      import('./vistas/sala/sala-telares.component').then((m) => m.SalaTelaresComponent),
    title: 'Fabric — Máquinas'
  },
  {
    path: 'telares/:id',
    loadComponent: () =>
      import('./vistas/telar/detalle-telar.component').then((m) => m.DetalleTelarComponent),
    title: 'Fabric — Detalle de máquina'
  },

  // Partes → Máquinas (producción) / Operarios (trabajo) / Disco puente /
  // Bloques / Tablas. Bloques y Tablas son los partes de entrada de inventario
  // (altas de almacén y tablas cortadas); viven aquí para dejar la sección
  // Inventario libre para su rediseño. Su contenido es el mismo de antes.
  {
    path: 'partes',
    component: SeccionLayoutComponent,
    data: {
      subpestanas: [
        { label: 'Máquinas', link: '/partes/maquinas' },
        { label: 'Operarios', link: '/partes/operarios' },
        { label: 'Disco puente', link: '/partes/disco-puente' },
        { label: 'Reforzadora', link: '/partes/reforzadora' },
        { label: 'Bloques', link: '/partes/bloques' },
        { label: 'Tablas', link: '/partes/tablas' }
      ]
    },
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'maquinas' },
      {
        path: 'maquinas',
        loadComponent: () =>
          import('./vistas/partes/partes.component').then((m) => m.PartesComponent),
        title: 'Fabric — Partes de producción'
      },
      {
        path: 'operarios',
        loadComponent: () =>
          import('./vistas/partes-trabajo/partes-trabajo.component').then(
            (m) => m.PartesTrabajoComponent
          ),
        title: 'Fabric — Partes de trabajo'
      },
      {
        path: 'disco-puente',
        loadComponent: () =>
          import('./vistas/partes-disco-puente/partes-disco-puente.component').then(
            (m) => m.PartesDiscoPuenteComponent
          ),
        title: 'Fabric — Partes del disco puente'
      },
      {
        path: 'reforzadora',
        loadComponent: () =>
          import('./vistas/partes-reforzadora/partes-reforzadora.component').then(
            (m) => m.PartesReforzadoraComponent
          ),
        title: 'Fabric — Partes de la reforzadora'
      },
      {
        path: 'bloques',
        loadComponent: () =>
          import('./vistas/inventario/inventario.component').then((m) => m.InventarioComponent),
        title: 'Fabric — Inventario de bloques'
      },
      {
        path: 'tablas',
        loadComponent: () =>
          import('./vistas/tablas/tablas.component').then((m) => m.TablasComponent),
        title: 'Fabric — Inventario de tablas'
      }
    ]
  },

  // Inventario → mapa de existencias (treemap). Las entradas en crudo de
  // bloques y tablas se sirven desde /partes.
  {
    path: 'inventario',
    loadComponent: () =>
      import('./vistas/inventario-mapa/inventario-mapa.component').then(
        (m) => m.InventarioMapaComponent
      ),
    title: 'Fabric — Inventario'
  },

  // Salud → Fuentes / Cuarentena / Detecciones.
  {
    path: 'salud',
    component: SeccionLayoutComponent,
    data: {
      subpestanas: [
        { label: 'Fuentes', link: '/salud/fuentes' },
        { label: 'Cobertura', link: '/salud/cobertura' },
        { label: 'Cuarentena', link: '/salud/cuarentena' },
        // Diagnóstico de datos reales: no se ofrece en Demo (ver soloReal).
        { label: 'Medidas dudosas', link: '/salud/medidas-dudosas', soloReal: true },
        { label: 'Detecciones', link: '/salud/detecciones' }
      ]
    },
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'fuentes' },
      {
        path: 'fuentes',
        loadComponent: () =>
          import('./vistas/datos/salud-datos.component').then((m) => m.SaludDatosComponent),
        data: { vista: 'fuentes' },
        title: 'Fabric — Fuentes de datos'
      },
      {
        path: 'cobertura',
        loadComponent: () =>
          import('./vistas/cobertura-maquinas/cobertura-maquinas.component').then(
            (m) => m.CoberturaMaquinasComponent
          ),
        title: 'Fabric — Cobertura de máquinas'
      },
      {
        path: 'cuarentena',
        loadComponent: () =>
          import('./vistas/datos/salud-datos.component').then((m) => m.SaludDatosComponent),
        data: { vista: 'cuarentena' },
        title: 'Fabric — Cuarentena'
      },
      {
        path: 'medidas-dudosas',
        loadComponent: () =>
          import('./vistas/medidas-dudosas/medidas-dudosas.component').then(
            (m) => m.MedidasDudosasComponent
          ),
        title: 'Fabric — Medidas dudosas'
      },
      {
        path: 'detecciones',
        loadComponent: () =>
          import('./vistas/salud-sistema/salud-sistema.component').then(
            (m) => m.SaludSistemaComponent
          ),
        title: 'Fabric — Detecciones'
      }
    ]
  },

  // Producción y paros: aún sin hueco en el menú nuevo; accesible por URL.
  {
    path: 'produccion',
    loadComponent: () =>
      import('./vistas/produccion/produccion.component').then((m) => m.ProduccionComponent),
    title: 'Fabric — Producción y paros'
  },

  // Compatibilidad con las URLs anteriores.
  { path: 'partes-trabajo', pathMatch: 'full', redirectTo: 'partes/operarios' },
  { path: 'inventario/bloques', pathMatch: 'full', redirectTo: 'partes/bloques' },
  { path: 'inventario/tablas', pathMatch: 'full', redirectTo: 'partes/tablas' },
  { path: 'datos', pathMatch: 'full', redirectTo: 'salud/cuarentena' },
  { path: 'sistema', pathMatch: 'full', redirectTo: 'salud/detecciones' },

  { path: '**', redirectTo: 'telares' }
];
