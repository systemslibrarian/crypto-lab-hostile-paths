import "./style.css";
import { mount } from "./ui/app";
import { buildPublicHelperPanel } from "./ui/public-helper";

const root = document.querySelector<HTMLElement>("#main");
if (!root) throw new Error("missing #main");
mount(root);
root.append(buildPublicHelperPanel());
