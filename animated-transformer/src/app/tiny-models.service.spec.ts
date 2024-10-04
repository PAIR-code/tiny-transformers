import { TestBed } from '@angular/core/testing';

import { TinyModelsService } from './tiny-models.service';
import { provideRouter } from '@angular/router';

describe('TinyModelsService', () => {
  let service: TinyModelsService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([])],
    });
    service = TestBed.inject(TinyModelsService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
