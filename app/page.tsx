import { ArchiveBrowser } from "@/components/ArchiveBrowser";
import archiveData from "@/data/archive.generated.json";
import type { ArchiveData } from "@/types/archive";

export default function HomePage() {
  return <ArchiveBrowser data={archiveData as ArchiveData} />;
}
