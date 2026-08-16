import { CabinetSidebar } from "@/components/CabinetSidebar";
import TutorWorkspace from "@/pages/TutorWorkspace";

export default function TutorCabinetShell() {
  return (
    <>
      <div className="hidden lg:block"><CabinetSidebar learningRole="tutor" floating /></div>
      <TutorWorkspace />
    </>
  );
}
