export type DemoRole = 'client' | 'staff' | 'admin';

export interface DemoAccount {
  id: DemoRole;
  role: DemoRole;
  name: string;
  username: string;
  email: string;
  password: string;
  title: string;
}

export interface DemoClientAccount {
  id: string;
  name: string;
  email: string;
  company: string;
  country: string;
  currency: string;
}

export const DEMO_CLIENTS: DemoClientAccount[] = [
  { id: 'client', name: 'Muster GmbH', email: 'client@fintax.demo', company: 'Muster GmbH', country: 'Germany', currency: 'EUR' },
  { id: 'client-nordlicht', name: 'Nordlicht Handel UG', email: 'nordlicht@fintax.demo', company: 'Nordlicht Handel UG', country: 'Germany', currency: 'EUR' },
  { id: 'client-palm', name: 'Palm Grove Trading LLC', email: 'palm@fintax.demo', company: 'Palm Grove Trading LLC', country: 'United Arab Emirates', currency: 'AED' },
];

export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    id: 'client',
    role: 'client',
    name: 'Muster GmbH',
    username: 'client demo',
    email: 'client@fintax.demo',
    password: 'client demo@2026',
    title: 'Client',
  },
  {
    id: 'staff',
    role: 'staff',
    name: 'Lena M.',
    username: 'staff demo',
    email: 'lena@fintax.demo',
    password: 'staff demo@2026',
    title: 'Staff',
  },
  {
    id: 'admin',
    role: 'admin',
    name: 'Alex Morgan',
    username: 'admin demo',
    email: 'admin@fintax.demo',
    password: 'admin demo@2026',
    title: 'Admin',
  },
];
