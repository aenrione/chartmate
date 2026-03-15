import { IHandleErrors, IValidateResponses, SpotifyApi } from '@spotify/web-api-ts-sdk';
import { getSpotifyAccessToken, clearSpotifyTokens } from '@/lib/spotify-auth';
import ProvidedAccessTokenStrategy from '@/lib/spotify-server/ProvidedAccessTokenStrategy';

export class RateLimitError extends Error {
  public status: number;
  public retryAfter: number;
  constructor(message: string, status: number, retryAfter: number) {
    super(message);
    this.name = 'RateLimitError';
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

class MyResponseValidator implements IValidateResponses {
  async validateResponse(response: Response): Promise<void> {
    switch (response.status) {
      case 401:
        throw new Error('Bad or expired token. Re-authenticate the user.');
      case 403: {
        const body = await response.text();
        throw new Error(`Bad OAuth request. Body: ${body}`);
      }
      case 429: {
        const retryAfter = parseInt(response.headers.get('Retry-After') ?? '5', 10);
        throw new RateLimitError('Rate limit exceeded.', 429, retryAfter);
      }
      default:
        if (!response.status.toString().startsWith('20')) {
          const body = await response.text();
          throw new Error(`Unrecognised response: ${response.status}. Body: ${body}`);
        }
    }
  }
}

class MyErrorHandler implements IHandleErrors {
  async handleErrors(error: any): Promise<boolean> {
    if (error.message?.includes('Bad or expired token')) {
      await clearSpotifyTokens();
      cachedSharedSdk = null;
    }
    return false;
  }
}

let cachedSharedSdk: SpotifyApi | null = null;

export async function getSpotifySdk(): Promise<SpotifyApi | null> {
  if (cachedSharedSdk) return cachedSharedSdk;

  try {
    const token = await getSpotifyAccessToken();
    const strategy = new ProvidedAccessTokenStrategy(
      token,
      () => getSpotifyAccessToken(),
    );
    cachedSharedSdk = new SpotifyApi(strategy, {
      responseValidator: new MyResponseValidator(),
      errorHandler: new MyErrorHandler(),
    });
    return cachedSharedSdk;
  } catch {
    return null;
  }
}

export function invalidateSpotifySdkCache(): void {
  cachedSharedSdk = null;
}
