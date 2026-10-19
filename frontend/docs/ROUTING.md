# Frontend Routing Notes

## Blog links: use `<a href>`, not `<Link to>`

When linking from the SPA to `/blog` (or any other path served directly by nginx rather than by React Router), always use a plain anchor tag:

```jsx
// Correct
<a href="/blog/my-post">Read the post</a>

// Wrong - will be hijacked by the SPA catchall and redirect to /org
<Link to="/blog/my-post">Read the post</Link>
```

### Why

`frontend/src/App.js` has a catchall route that redirects any unmatched path to `/org`:

```jsx
<Route path="*" element={<Navigate to="/org" replace />} />
```

React Router intercepts navigation from `<Link>` components before the browser can request the URL. An internal `<Link to="/blog/foo">` matches the catchall, triggers the redirect, and the user never reaches nginx.

A plain `<a href="/blog/foo">` triggers a full page navigation. The browser requests the URL from nginx, which serves the Hugo static output configured under `/blog` (see issue #513 for the nginx location block).

### Rule of thumb

| Destination | Use |
| --- | --- |
| Another SPA route (`/org/...`) | `<Link to="...">` |
| Static content served by nginx (`/blog/...`) | `<a href="...">` |
| External URL | `<a href="..." target="_blank" rel="noopener">` |

### Follow-up

An optional ESLint rule that flags `<Link to="/blog` could catch future regressions automatically. Not yet implemented; tracked separately.
