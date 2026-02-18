export type Role = 'admin' | 'doctor' | 'patient';

export interface User {
  id: string;
  role: Role;
}
