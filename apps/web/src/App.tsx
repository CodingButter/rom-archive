import { Route, Routes } from "react-router-dom";

import { Browse } from "./Browse";
import { Install } from "./Install";
import { Item } from "./Item";
import { Landing } from "./Landing";

export function App(): React.JSX.Element {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/install" element={<Install />} />
      <Route path="/browse" element={<Browse />} />
      <Route path="/item/:id" element={<Item />} />
    </Routes>
  );
}
