import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'telares' },
  {
    path: 'telares',
    loadComponent: () =>
      import('./vistas/sala/sala-telares.component').then((m) => m.SalaTelaresComponent),
    title: 'Fabric — Sala de telares'
  },
  {
    path: 'telares/:id',
    loadComponent: () =>
      import('./vistas/telar/detalle-telar.component').then((m) => m.DetalleTelarComponent),
    title: 'Fabric — Detalle de telar'
  },
  {
    path: 'partes',
    loadComponent: () =>
      import('./vistas/partes/partes.component').then((m) => m.PartesComponent),
    title: 'Fabric — Partes de producción'
  },
  {
    path: 'partes-trabajo',
    loadComponent: () =>
      import('./vistas/partes-trabajo/partes-trabajo.component').then(
        (m) => m.PartesTrabajoComponent
      ),
    title: 'Fabric — Partes de trabajo'
  },
  {
    path: 'produccion',
    loadComponent: () =>
      import('./vistas/produccion/produccion.component').then((m) => m.ProduccionComponent),
    title: 'Fabric — Producción y paros'
  },
  {
    path: 'inventario',
    loadComponent: () =>
      import('./vistas/inventario/inventario.component').then((m) => m.InventarioComponent),
    title: 'Fabric — Inventario de bloques'
  },
  {
    path: 'datos',
    loadComponent: () =>
      import('./vistas/datos/salud-datos.component').then((m) => m.SaludDatosComponent),
    title: 'Fabric — Salud del dato'
  },
  {
    path: 'sistema',
    loadComponent: () =>
      import('./vistas/salud-sistema/salud-sistema.component').then(
        (m) => m.SaludSistemaComponent
      ),
    title: 'Fabric — Salud del sistema'
  },
  { path: '**', redirectTo: 'telares' }
];
