import { describe, it, expect } from 'vitest';
import { DEFAULT_TARGETS, targetsForYard, yardIntake, validTargets } from './yardTargets';
import { emptyYard } from './raceHQ';
import { drinkEntry } from './intakeAdvice';
describe('per-yard guides', () => {
  it('uses race-local clock and changes at 19:00 and 07:00', () => {
    expect(targetsForYard(4).fluidMin).toBe(350);
    expect(targetsForYard(5).fluidMin).toBe(250);
    expect(targetsForYard(16).night).toBe(true);
    expect(targetsForYard(17).night).toBe(false);
    expect(targetsForYard(29).night).toBe(true);
  });
  it('keeps unknown food separate and does not carry totals to a new yard', () => {
    const record = { ...emptyYard(), intake: [drinkEntry('160', 500, '2026-10-17T12:50:00Z', '1'), { id: '2', at: '2026-10-17T12:51:00Z', text: 'Mash' }] };
    expect(yardIntake(record)).toEqual({ carbs: 40, fluid: 500, incomplete: true });
    expect(yardIntake(emptyYard()).carbs).toBe(0);
  });
  it('validates editable bounds and leaves default carb range constant', () => {
    expect(validTargets(DEFAULT_TARGETS)).toBe(true);
    expect(validTargets({ ...DEFAULT_TARGETS, carbMin: 70 })).toBe(false);
    expect(targetsForYard(5).carbMin).toBe(50);
    expect(targetsForYard(1, { ...DEFAULT_TARGETS, carbMin: 45 }).carbMin).toBe(45);
  });
});
