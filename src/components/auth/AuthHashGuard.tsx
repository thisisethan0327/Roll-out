'use client';
/**
 * Remove an auth fragment from the address bar, wherever it lands.
 *
 * BrokerHashSession consumes and strips the tokens, but it only lives on
 * /shop/login — and somebody who ALREADY has a session never goes there. The
 * broker returns them to the console root, the middleware rewrites "/" to their
 * overview, the server sees a valid cookie and renders it, and nothing ever
 * touches the fragment: #access_token and #refresh_token sit in the URL for the
 * rest of the session (run 10, lanes C and D).
 *
 * That is a bearer credential living in the address bar, browser history, and
 * anything the person copies or screenshots from it.
 *
 * This only strips. It does not exchange, and it must not: reaching a console
 * page at all means the server already accepted a session cookie, so the tokens
 * in the URL are a duplicate of something we hold properly. On the login page —
 * the one place they might be the ONLY copy — BrokerHashSession runs instead and
 * consumes them first.
 */
import { useEffect } from 'react';

const AUTH_HASH = /(^|[#&])(access_token|refresh_token|error_description)=/;

export function AuthHashGuard() {
    useEffect(() => {
        const hash = window.location.hash;
        if (!hash || !AUTH_HASH.test(hash)) return;
        try {
            window.history.replaceState(
                null,
                '',
                window.location.pathname + window.location.search,
            );
        } catch {
            // A history-API quirk is not worth throwing out of an effect over;
            // the session is unaffected either way.
        }
    }, []);

    return null;
}
