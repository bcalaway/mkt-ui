import { screens, screenFor } from "./screens";
import { linkProps, useLocation } from "./router";

export default function App() {
  const location = useLocation();
  const screen = screenFor(location.path);
  const Screen = screen.Component;
  return (
    <>
      <header className="masthead">
        <a className="brand" {...linkProps("/")}>
          Treasury yields
        </a>
        <nav aria-label="Screens">
          {screens.map((s) => (
            <a key={s.id} {...linkProps(s.path)} aria-current={s.id === screen.id ? "page" : undefined}>
              {s.title}
            </a>
          ))}
        </nav>
      </header>
      <main>
        <Screen location={location} />
      </main>
    </>
  );
}
