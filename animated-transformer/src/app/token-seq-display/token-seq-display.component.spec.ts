import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TokenSeqDisplayComponent } from './token-seq-display.component';
import { provideExperimentalZonelessChangeDetection } from '@angular/core';

describe('TokenSeqDisplayComponent', () => {
  let component: TokenSeqDisplayComponent;
  let fixture: ComponentFixture<TokenSeqDisplayComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [provideExperimentalZonelessChangeDetection()],
      imports: [TokenSeqDisplayComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(TokenSeqDisplayComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
