import {createClient} from '@supabase/supabase-js';

// Publishable key only. Authorization is enforced by database policies.
export const supabase = createClient('https://rxvrcvibouvfmvucsehx.supabase.co',
  'sb_publishable_zVO3tvPfmhEenM-MQl4hHg_EogWn-T_',
  {auth: {persistSession: true, autoRefreshToken: true, detectSessionInUrl: true}});
export type Profile = {id:string; name:string; email:string; role:'administrador'|'vendedor'; active:boolean};
