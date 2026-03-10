"use client";

import Link from "next/link";

const T: Record<string, Record<string, string>> = {
  contact: {
    fr: "Vous ne trouvez pas la réponse ?",
    en: "Can't find the answer?",
    es: "¿No encuentras la respuesta?",
    it: "Non trovi la risposta?",
    ar: "لا تجد الإجابة؟",
  },
  contact_cta: {
    fr: "Contactez-nous à hello@tipote.com",
    en: "Contact us at hello@tipote.com",
    es: "Contáctanos en hello@tipote.com",
    it: "Contattaci a hello@tipote.com",
    ar: "تواصل معنا على hello@tipote.com",
  },
  rights: {
    fr: "Tous droits réservés",
    en: "All rights reserved",
    es: "Todos los derechos reservados",
    it: "Tutti i diritti riservati",
    ar: "جميع الحقوق محفوظة",
  },
};

export default function SupportFooter({ locale }: { locale: string }) {
  return (
    <footer className="bg-white border-t border-gray-100 mt-16">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 text-center">
        <p className="text-gray-600 font-medium mb-1">
          {T.contact[locale] ?? T.contact.fr}
        </p>
        <a
          href="mailto:hello@tipote.com"
          className="text-violet-600 hover:text-violet-700 font-medium text-sm"
        >
          {T.contact_cta[locale] ?? T.contact_cta.fr}
        </a>

        <div className="mt-8 pt-6 border-t border-gray-50 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-400">
          <span>&copy; {new Date().getFullYear()} Tipote. {T.rights[locale] ?? T.rights.fr}.</span>
          <div className="flex items-center gap-4">
            <Link href="/legal/conditions-utilisation" className="hover:text-gray-600">
              {locale === "fr" ? "CGU" : locale === "es" ? "Términos" : locale === "it" ? "Termini" : locale === "ar" ? "الشروط" : "Terms"}
            </Link>
            <Link href="/legal/politique-confidentialite" className="hover:text-gray-600">
              {locale === "fr" ? "Confidentialité" : locale === "es" ? "Privacidad" : locale === "it" ? "Privacy" : locale === "ar" ? "الخصوصية" : "Privacy"}
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
