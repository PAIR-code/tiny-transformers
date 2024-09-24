import { TestBed } from '@angular/core/testing';

import { TinyModelsService } from './tiny-models.service';

describe('TinyModelsService', () => {
  let service: TinyModelsService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(TinyModelsService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
