import { TestBed } from '@angular/core/testing';

import { CellRegistryService } from './cell-registry.service';

describe('CellRegistryService', () => {
  let service: CellRegistryService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(CellRegistryService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
