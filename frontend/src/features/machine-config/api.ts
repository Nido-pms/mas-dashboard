import { apiGet, apiPut } from '../../api/client';
import type { MachineConfig, MachineConfigUpdate, Shift } from './types';

export const fetchMachineConfig = (site: string | undefined, signal?: AbortSignal) =>
  apiGet<MachineConfig>('/machine-config', { site }, signal);

export const saveMachineConfig = (site: string, update: MachineConfigUpdate) =>
  apiPut<MachineConfig>('/machine-config', update, { site });

export const saveShifts = (site: string, shifts: Shift[]) =>
  apiPut<MachineConfig>('/machine-config/shifts', { shifts }, { site });