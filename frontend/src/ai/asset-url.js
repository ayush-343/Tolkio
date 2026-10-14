// WebLLM normalizes model roots by appending resolve/main/. Our controlled
// hosting uses immutable revision directories instead of Hugging Face routes.
export function resolveCachedAsset(input, manifest, origin) {
  const url = new URL(input instanceof URL ? input.href : typeof input === 'string' ? input : input.url, origin);
  const base = new URL(manifest.baseUrl, origin);
  for (const file of manifest.files) {
    const canonical = new URL(file.path, base);
    const runtimeAlias = new URL(`resolve/main/${file.path}`, base);
    if (url.href === canonical.href || url.href === runtimeAlias.href) return { file, url: canonical };
  }
  throw new Error('Local AI blocked an unexpected model request.');
}
