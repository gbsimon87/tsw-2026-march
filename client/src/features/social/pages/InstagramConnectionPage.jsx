import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Breadcrumbs } from '../../../components/Breadcrumbs';
import { DarkPageHeader } from '../../../components/DarkPageHeader';
import { instagramApi } from '../api/instagramApi';

const OAUTH_MESSAGES = {
  connected: { tone: 'green', text: 'Instagram connected and verified successfully.' },
  cancelled: { tone: 'amber', text: 'Instagram connection was cancelled.' },
  failed: { tone: 'red', text: 'Instagram could not be connected. Please try again.' },
};

function formatDate(value) {
  if (!value) return 'Not provided by Instagram';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value)
  );
}

export function InstagramConnectionPage() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [action, setAction] = useState('');
  const [error, setError] = useState('');
  const oauthMessage = OAUTH_MESSAGES[searchParams.get('oauth')] || null;

  async function loadStatus() {
    setError('');
    try {
      setStatus(await instagramApi.getStatus());
    } catch (loadError) {
      setError(loadError.message || 'Could not load Instagram status');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadStatus();
  }, []);

  async function connect() {
    setAction('connect');
    setError('');
    try {
      const { authorizationUrl } = await instagramApi.startOAuth();
      window.location.assign(authorizationUrl);
    } catch (connectError) {
      setError(connectError.message || 'Could not start Instagram connection');
      setAction('');
    }
  }

  async function verify() {
    setAction('verify');
    setError('');
    try {
      const result = await instagramApi.verify();
      setStatus((current) => ({ ...current, connection: result.connection }));
    } catch (verifyError) {
      setError(verifyError.message || 'Instagram verification failed');
    } finally {
      setAction('');
    }
  }

  async function disconnect() {
    if (!window.confirm('Disconnect this Instagram account from TSW?')) return;
    setAction('disconnect');
    setError('');
    try {
      await instagramApi.disconnect();
      setStatus((current) => ({ ...current, connection: null }));
    } catch (disconnectError) {
      setError(disconnectError.message || 'Could not disconnect Instagram');
    } finally {
      setAction('');
    }
  }

  const connection = status?.connection;

  return (
    <main className="space-y-6 bg-[#F7F5F0] -m-4 p-4 md:-m-6 md:p-6">
      <Breadcrumbs
        crumbs={[{ label: 'Admin', href: '/admin' }, { label: 'Instagram publishing' }]}
      />
      <DarkPageHeader
        eyebrow="Social publishing"
        title="Instagram connection"
        titleAriaLabel="Instagram connection"
        description="Connect and verify the official TSW professional account. This screen does not publish content."
      />

      {oauthMessage ? (
        <p
          className={`rounded-xl border px-4 py-3 text-sm ${
            oauthMessage.tone === 'green'
              ? 'border-green-200 bg-green-50 text-green-800'
              : oauthMessage.tone === 'amber'
                ? 'border-amber-200 bg-amber-50 text-amber-800'
                : 'border-red-200 bg-red-50 text-red-800'
          }`}
        >
          {oauthMessage.text}
        </p>
      ) : null}

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 md:p-6">
        {isLoading ? (
          <p className="text-sm text-slate-600">Loading Instagram status…</p>
        ) : !status?.configured ? (
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Setup required</h2>
            <p className="mt-2 text-sm text-slate-600">
              The server is missing its Meta app or encryption configuration. Complete the runbook
              setup before connecting an account.
            </p>
          </div>
        ) : connection ? (
          <div className="space-y-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-green-700">
                  Connected
                </p>
                <h2 className="mt-1 text-xl font-semibold text-slate-900">
                  @{connection.username}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {connection.accountType || 'Professional account'} · ID {connection.accountId}
                </p>
              </div>
              <span className="w-fit rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-800">
                Verified
              </span>
            </div>

            <dl className="grid gap-3 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-slate-500">Last verified</dt>
                <dd className="mt-1 font-medium text-slate-900">
                  {formatDate(connection.lastVerifiedAt)}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Token expires</dt>
                <dd className="mt-1 font-medium text-slate-900">
                  {formatDate(connection.tokenExpiresAt)}
                </dd>
              </div>
            </dl>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={verify}
                disabled={Boolean(action)}
                className="rounded-lg bg-[#141414] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {action === 'verify' ? 'Verifying…' : 'Verify connection'}
              </button>
              <button
                type="button"
                onClick={connect}
                disabled={Boolean(action)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
              >
                Reconnect account
              </button>
              <button
                type="button"
                onClick={disconnect}
                disabled={Boolean(action)}
                className="rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-50"
              >
                {action === 'disconnect' ? 'Disconnecting…' : 'Disconnect'}
              </button>
            </div>
          </div>
        ) : (
          <div>
            <h2 className="text-lg font-semibold text-slate-900">No Instagram account connected</h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              Sign in to the official TSW Business or Creator account and approve only basic profile
              access and content publishing. The access token stays encrypted on the server.
            </p>
            <button
              type="button"
              onClick={connect}
              disabled={Boolean(action)}
              className="mt-5 rounded-lg bg-[#F4A300] px-4 py-2 text-sm font-semibold text-[#141414] disabled:opacity-50"
            >
              {action === 'connect' ? 'Opening Instagram…' : 'Connect Instagram'}
            </button>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
        <h2 className="font-semibold text-slate-900">Current safety boundary</h2>
        <p className="mt-2">
          Only platform operators can access this page. Connecting the account does not enable
          automatic or live publishing; post approval and test publishing are the next milestone.
        </p>
      </section>
    </main>
  );
}
