import { getSessionUser } from './auth';
import SignIn from './signin';
import MarketApp from './market-app';
import VerifiedBanner from './verified-banner';
import VerifyReminder from './verify-reminder';
import {workspace} from '@/lib/server';
export const dynamic = 'force-dynamic';
export default async function Home() {
  const user = await getSessionUser();
  if (!user) return <><VerifiedBanner /><SignIn /></>;
  const actor = await workspace(undefined, 'read');
  return <><VerifiedBanner />{!user.emailVerified && <VerifyReminder />}<MarketApp email={user.email} ownerId={actor.businessId} /></>;
}
