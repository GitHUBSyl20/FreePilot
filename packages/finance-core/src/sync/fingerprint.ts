import type { FinanceData } from '../types';

/**
 * Sérialisation déterministe : les clés sont triées avant écriture.
 *
 * `JSON.stringify` suit l'ordre d'insertion. Une migration qui reconstruit un
 * objet par étalement changerait donc l'empreinte sans qu'aucune valeur n'ait
 * bougé, et l'appareil renverrait au cloud un document identique.
 */
const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;

  const source = value as Record<string, unknown>;
  const entries = Object.keys(source)
    .sort()
    // Une clé à `undefined` disparaît en JSON : l'ignorer aussi ici, sinon un
    // champ optionnel absent et un champ optionnel à `undefined` donneraient
    // deux empreintes pour un même document une fois envoyé.
    .filter((key) => source[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${stableStringify(source[key])}`);

  return `{${entries.join(',')}}`;
};

/** FNV-1a 32 bits : suffisant pour comparer deux états d'un même document. */
const fnv1a = (input: string): number => {
  let hash = 0x811c9dc5;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return hash >>> 0;
};

/**
 * Empreinte des données locales, comparée à celle du dernier envoi réussi
 * pour savoir s'il y a quelque chose à synchroniser.
 *
 * Un simple drapeau « modifié » mentirait dès qu'une écriture échoue ou qu'un
 * import remplace tout ; l'empreinte se recalcule à partir des données et ne
 * peut pas se désynchroniser d'elles.
 *
 * La longueur sérialisée est jointe au hachage : deux signaux indépendants
 * rendent le cas où une modification passerait inaperçue négligeable.
 */
export const fingerprintFinanceData = (data: FinanceData): string => {
  const serialized = stableStringify(data);

  return `${serialized.length.toString(36)}-${fnv1a(serialized).toString(16).padStart(8, '0')}`;
};
