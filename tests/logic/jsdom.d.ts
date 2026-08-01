// Déclaration minimale de jsdom (dépendance transitive d'isomorphic-dompurify,
// utilisée uniquement par les tests de logique DOM). On n'ajoute pas
// @types/jsdom au projet pour une surface aussi réduite.
declare module "jsdom" {
  export class JSDOM {
    constructor(html?: string);
    readonly window: { document: Document };
  }
}
