import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, ShieldAlert, ArrowLeft } from 'lucide-react';
import { completeLogin } from '../api/oauth';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui';

export default function Callback() {
  const { connect } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return; // guard against StrictMode double-invoke
    ran.current = true;
    (async () => {
      try {
        const result = await completeLogin(window.location.search);
        await connect(result.baseUrl, result.token, {
          kind: 'oidc',
          refreshToken: result.refreshToken,
          clientId: result.clientId,
          tokenEndpoint: result.tokenEndpoint,
          expiresIn: result.expiresIn,
        });
        navigate('/', { replace: true });
      } catch (err) {
        setError((err as Error).message);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="grid min-h-screen place-items-center p-6">
      <div className="glass w-full max-w-md p-8 text-center fade-up">
        {error ? (
          <>
            <div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-rose-500/15 text-rose-300">
              <ShieldAlert className="size-7" />
            </div>
            <h1 className="text-lg font-semibold text-white">Sign-in failed</h1>
            <p className="mx-auto mt-2 max-w-sm text-sm text-[var(--color-ink-dim)]">{error}</p>
            <Button
              className="mt-6"
              variant="ghost"
              icon={<ArrowLeft className="size-4" />}
              onClick={() => navigate('/login', { replace: true })}
            >
              Back to sign in
            </Button>
          </>
        ) : (
          <>
            <Loader2 className="mx-auto size-8 animate-spin text-[var(--color-accent)]" />
            <h1 className="mt-4 text-lg font-semibold text-white">Completing sign-in…</h1>
            <p className="mt-1 text-sm text-[var(--color-ink-dim)]">
              Exchanging the authorization code with your ZITADEL instance.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
