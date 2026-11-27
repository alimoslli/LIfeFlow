import { Composition, Series } from "remotion";
import { PROJECTS } from "./projects";
import { metaOf, type Project } from "./projects/types";
import { DIMS, type Format } from "./kit/util";
import { loadFonts } from "./kit/fonts";

export const FPS = 30;
type Props = { format: Format };
const frames = (s: number) => Math.round(s * FPS);
const dims = ({ props }: { props: Props }) => {
  const [width, height] = DIMS[props.format ?? "9x16"];
  return { width, height };
};

function Full({ project, format }: { project: Project; format: Format }) {
  return (
    <Series>
      {project.scenes.map((s) => (
        <Series.Sequence key={s.id} durationInFrames={frames(s.seconds)}>
          <s.component format={format} />
        </Series.Sequence>
      ))}
    </Series>
  );
}
/**
 * Each scene is its own composition ("<project>-<scene>") so the render script can render, cache and revise scenes one
 * at a time; "<project>-full" plays them in order for previewing in Remotion Studio and carries the project's metadata.
 */
export function Root() {
  loadFonts();
  return (
    <>
      {PROJECTS.flatMap((p) => [
        <Composition
          key={`${p.id}-full`}
          id={`${p.id}-full`}
          component={({ format }: Props & { meta?: unknown }) => <Full project={p} format={format} />}
          durationInFrames={p.scenes.reduce((a, s) => a + frames(s.seconds), 0)}
          fps={FPS}
          width={1080}
          height={1920}
          defaultProps={{ format: "9x16" as Format, meta: metaOf(p) }}
          calculateMetadata={({ props }) => dims({ props })}
        />,
        ...p.scenes.map((s) => (
          <Composition
            key={`${p.id}-${s.id}`}
            id={`${p.id}-${s.id}`}
            component={({ format }: Props) => <s.component format={format} />}
            durationInFrames={frames(s.seconds)}
            fps={FPS}
            width={1080}
            height={1920}
            defaultProps={{ format: "9x16" as Format }}
            calculateMetadata={({ props }) => dims({ props })}
          />
        )),
      ])}
    </>
  );
}
