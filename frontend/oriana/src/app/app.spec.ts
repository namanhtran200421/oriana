import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('lays the atmosphere over every page', () => {
    const fixture = TestBed.createComponent(App);
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.atmosphere-grain')).toBeTruthy();
    expect(root.querySelector('.atmosphere-vignette')).toBeTruthy();
  });
});
