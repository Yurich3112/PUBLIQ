import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isAppLocale } from "@/schemas/i18n";
import { OcrWalkthrough } from "./ocr-walkthrough";

export async function generateMetadata({ params }: PageProps<"/[locale]/ocr/pokaz">): Promise<Metadata> {
  const { locale } = await params;
  const polish = locale === "pl";
  return {
    title: polish ? "Jak działa OCR — PUBLIQ" : "How OCR works — PUBLIQ",
    description: polish
      ? "Spowolniony przebieg lokalnego odczytu pisma ręcznego: ramki słów, pierwszy odczyt obrazu i druga korekta całego pisma."
      : "A slowed-down replay of local handwriting OCR: word boxes, a first image reading, and a second pass over the whole letter.",
  };
}

export default async function OcrWalkthroughPage({ params }: PageProps<"/[locale]/ocr/pokaz">) {
  const { locale } = await params;
  if (!isAppLocale(locale)) notFound();
  return <OcrWalkthrough polish={locale === "pl"} />;
}
