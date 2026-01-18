import * as React from "react";
import type { DocumentRef } from "@league/types";

export type ViewerProps = {
  document: DocumentRef;
  watermark?: string;
};

export const Viewer: React.FC<ViewerProps> = ({ document, watermark }) => {
  return (
    <section>
      <header>
        <h2>{document.title}</h2>
        {watermark ? <p>{watermark}</p> : null}
      </header>
      <div>
        <p>Preview URL: {document.previewUrl ?? "Not available"}</p>
      </div>
    </section>
  );
};
