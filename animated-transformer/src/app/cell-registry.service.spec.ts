import { TestBed } from '@angular/core/testing';

import { CellRegistryService } from './cell-registry.service';
import { provideExperimentalZonelessChangeDetection } from '@angular/core';

describe('CellRegistryService', () => {
  let service: CellRegistryService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideExperimentalZonelessChangeDetection()],
    });
    service = TestBed.inject(CellRegistryService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
