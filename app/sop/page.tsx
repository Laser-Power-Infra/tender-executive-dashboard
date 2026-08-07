import { FileText } from "lucide-react";

export default function SopPage() {
  return (
    <div className="flex flex-1 flex-col p-6 gap-4" style={{ paddingTop: "12px" }}>
      <div className="flex items-center gap-2">
        <FileText className="size-5 text-[#0a2540]" />
        <h1 className="text-xl font-bold text-[#0a2540]">SOP</h1>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6 max-w-3xl">
        <h2 className="text-base font-semibold text-gray-900 mb-4">
          Roles &amp; Responsibilities
        </h2>

        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-800">
              1. Tender Uploading
            </h3>
            <p className="text-sm text-gray-600">
              Tender uploading is done by{" "}
              <span className="font-medium text-gray-900">Arpan Pal</span>{" "}
              <a
                href="mailto:sales@uicwires.com"
                className="text-[#0a2540] underline hover:text-[#163d66]"
              >
                sales@uicwires.com
              </a>
            </p>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-gray-800">
              2. Management Decision (YES/NO)
            </h3>
            <p className="text-sm text-gray-600">
              Management decision (YES/NO) is done by{" "}
              <span className="font-medium text-gray-900">Puja Agarwal</span>{" "}
              <a
                href="mailto:puja.agarwal@laserpowerinfra.com"
                className="text-[#0a2540] underline hover:text-[#163d66]"
              >
                puja.agarwal@laserpowerinfra.com
              </a>{" "}
              and{" "}
              <span className="font-medium text-gray-900">
                Sambhu Chakraborty
              </span>{" "}
              <a
                href="mailto:sambhu@laserpowerinfra.com"
                className="text-[#0a2540] underline hover:text-[#163d66]"
              >
                sambhu@laserpowerinfra.com
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
