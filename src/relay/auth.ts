export function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) {
    return null;
  }
  const prefix = "Bearer ";
  if (!header.toLowerCase().startsWith(prefix.toLowerCase())) {
    return null;
  }
  const token = header.slice(prefix.length).trim();
  return token || null;
}
