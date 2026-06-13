import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideRouter, withComponentInputBinding } from '@angular/router';

import { routes } from './app.routes';
import { ConmutadorFabricApi } from './core/conmutador-fabric-api';
import { FabricApi } from './core/fabric-api';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withFetch()),
    // El conmutador delega en MockFabricApi (demo) o HttpFabricApi (real)
    // según el switch de fuente de la barra superior.
    { provide: FabricApi, useExisting: ConmutadorFabricApi }
  ]
};
