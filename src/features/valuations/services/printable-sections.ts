import type { AppSection } from "@/features/valuations/model";
import { groupSectionsForPrint } from "./document-structure";
import { excludedReportApproaches, sectionForReport } from "./report-approaches";

/**
 * The sections the dictamen prints, in the groups that share their pages: the
 * visible ones, without the approaches left out of the dictamen, a section
 * that continues the one before joined to its group.
 */
export function printableSectionGroups(sections: AppSection[]): AppSection[][] {
  const excluded = excludedReportApproaches(sections);
  const printed = sections
    .filter((section) => section.enabled !== false)
    .map((section) => sectionForReport(section, excluded))
    .filter((section): section is AppSection => section !== null);
  return groupSectionsForPrint(printed);
}
