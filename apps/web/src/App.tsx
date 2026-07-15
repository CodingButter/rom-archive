import { Route, Routes } from "react-router-dom";

import { Install } from "./Install";
import { Landing } from "./Landing";

export function App(): React.JSX.Element {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/install" element={<Install />} />
    </Routes>
  );
}
