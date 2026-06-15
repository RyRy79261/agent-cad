// Calibration-cube troubleshooting knowledge base for the Ender 5 S1 + OrcaSlicer.
//
// Sourced from a verified research pass (corner-ribbing diagnosis + OrcaSlicer/Ender
// 5 S1 specifics; 19/19 claims stood under adversarial verification). Grounded in our
// committed profiles in services/slice/src/slicer/profiles/ender5s1/. Beginner-facing.

export type Impact = "high" | "medium" | "low";
export type Severity = "cosmetic" | "dimensional" | "structural" | "critical";

export interface Fix {
  action: string;
  /** where the lever lives: an exact OrcaSlicer setting, a calibration test, firmware, or hardware. */
  where: string;
  detail: string;
  impact: Impact;
}

export interface Symptom {
  id: string;
  symptom: string;
  alsoCalled: string[];
  whatYouSee: string;
  rootCauses: string[];
  fixes: Fix[];
  primaryTest: string;
  severity: Severity;
  /** optional callout, e.g. "our committed profile already mitigates this". */
  note?: string;
}

export const SYMPTOMS: Symptom[] = [
  {
    id: "corner-bulging",
    symptom: "Corner bulging (“ribbing”)",
    alsoCalled: ["corner blobbing", "vertex bulging", "bulged corners", "ribbing (misnomer)"],
    whatYouSee:
      "Each of the four vertical corners sticks out a little proud of the flat faces — a raised rib or blob right ON the corner. Run a fingernail down a corner and you feel a bump; the flat faces between corners are clean. (A lump ON the corner = bulging. Faint ripples trailing AFTER a corner = ringing, a different problem.)",
    rootCauses: [
      "Steady-state OVER-EXTRUSION (the dominant, firmware-free-fixable part): the walls are a touch fat, and the excess piles up most at corners where the head dwells through the direction change. Lowering flow ratio attacks this directly — the owner’s 0.98 → 0.95 was the single biggest improvement.",
      "Melt-pressure lag (the residual): with no pressure advance, nozzle pressure keeps oozing as the head decelerates into each corner. Slicer settings can only shrink this part, not remove it.",
      "Pressure advance is blocked on stock firmware: the Ender 5 S1 ships without Linear Advance compiled in, so OrcaSlicer’s M900 command is a silent no-op until the firmware is reflashed.",
      "Counter-intuitive trap: lowering acceleration/jerk to “smooth” corners makes bulging WORSE (longer corner dwell), and RAISING jerk does nothing — at 25 mm/s walls jerk is non-binding (jerk 25 = wall speed 25). Leave motion settings alone; the lever is flow.",
    ],
    fixes: [
      {
        action: "Lower the flow ratio — the #1 firmware-free lever",
        where: "OrcaSlicer › Calibration › Flow Rate (filament_flow_ratio)",
        detail:
          "The dominant fix: less plastic everywhere → less to pile up at corners. The owner’s 0.98 → 0.95 gave the single biggest improvement. But 0.95 is about the PLA floor — below ~0.92–0.93 you under-extrude (gappy tops, weak walls). Calibrate against measured wall thickness; don’t keep dropping it to chase corners.",
        impact: "high",
      },
      {
        action: "Slow the outer + inner wall speed (secondary)",
        where: "OrcaSlicer › Speed › Walls (outer_wall_speed / inner_wall_speed)",
        detail:
          "Lowered 40 → 25 mm/s. Less cruise pressure → a smaller corner over-deposit. Marginal at 25 mm/s (diminishing returns below ~20) — a stopgap, not the main lever. Optional A/B: outer-only 25 → 20.",
        impact: "low",
      },
      {
        action: "Enable Precise wall",
        where: "OrcaSlicer › Quality › Precision › Precise wall (precise_outer_wall)",
        detail:
          "Removes the wall overlap that pushes the outer wall slightly proud, so the cube measures truer. This is a dimensional-accuracy setting, not a bulge-amplitude fix. Only works with inner→outer wall order, which we keep.",
        impact: "medium",
      },
      {
        action: "Do NOT set a pressure-advance value on stock firmware",
        where: "OrcaSlicer › Filament › Pressure advance (leave OFF)",
        detail:
          "On stock Ender 5 S1 firmware the M900 it emits does nothing — setting it gives false confidence. The real cure (pressure advance) needs a firmware flash, which is an advanced, optional project.",
        impact: "medium",
      },
      {
        action: "Do NOT touch acceleration or jerk to fight the bulge",
        where: "OrcaSlicer › Printer › Motion ability (leave as-is)",
        detail:
          "Lowering accel/jerk = longer corner dwell = MORE over-deposit. Raising jerk does nothing: at 25 mm/s walls it’s non-binding (owner A/B: jerk 20→35 = zero change). The bulge lever is flow, not motion — jerk/accel are the RINGING levers, and there’s no ringing here.",
        impact: "low",
      },
    ],
    primaryTest:
      "OrcaSlicer › Calibration › Flow Rate (Pass 1 → Pass 2) — find your true flow, the dominant firmware-free lever. The full cure (pressure advance) only exists after flashing Linear-Advance firmware.",
    severity: "cosmetic",
    note: "This is our known first-print issue. The committed Ender 5 S1 profile already applies the flow (0.95) + wall-speed (25) + Precise-wall mitigations, so new slices get them automatically. The remaining bulge is the pressure-lag component that only firmware pressure advance removes — cosmetic and normal on a stock machine.",
  },
  {
    id: "first-layer",
    symptom: "Poor first layer / wrong Z-offset",
    alsoCalled: ["bad first layer", "Z-offset too high/low", "not sticking", "over-squished"],
    whatYouSee:
      "Too high: first-layer lines sit as separate round strings with gaps and don’t stick — the print pops loose. Too low: a glassy, over-squished, translucent bottom with the nozzle scraping plastic.",
    rootCauses: [
      "Live Z-offset not dialed in — the CR-Touch baseline still needs a squish tune.",
      "Uneven bed across the plate (needs an auto-level pass).",
      "Greasy or dusty PC spring-steel sheet reducing adhesion.",
    ],
    fixes: [
      {
        action: "Tune the live Z-offset with baby-steps on the first layer",
        where: "Printer › live Z-offset on the LCD",
        detail:
          "While the first layer prints: nudge Z down if lines are separate/not sticking, up if the layer is glassy and over-squished. Aim for lines that just touch with no gaps and no scraping.",
        impact: "high",
      },
      {
        action: "Re-run CR-Touch auto bed level if the first layer is uneven",
        where: "Printer › CR-Touch auto-level",
        detail: "If one region prints well and another doesn’t, the plate isn’t level — run the probe, then re-tune Z-offset.",
        impact: "high",
      },
      {
        action: "Clean the sheet with IPA",
        where: "Hardware",
        detail: "Wipe with isopropyl alcohol to remove fingerprints/oils that kill PLA adhesion on the PC sheet.",
        impact: "medium",
      },
    ],
    primaryTest: "First-layer / Z-offset tuning (live baby-steps + CR-Touch auto-level). A bad first layer distorts every other cube measurement — fix this before anything else.",
    severity: "structural",
  },
  {
    id: "warping",
    symptom: "Warping / poor bed adhesion",
    alsoCalled: ["warping", "lifting corners", "curling", "detaching"],
    whatYouSee:
      "Base corners curl up off the bed and the bottom looks lifted; in bad cases the whole print pops loose mid-job. Less common with PLA than ASA/PETG.",
    rootCauses: [
      "Poor first-layer adhesion (greasy or cool bed), or uneven cooling pulling the corners up.",
      "No brim — our brim width is 0, so there’s no extra grip on the base.",
      "Drafts across the open Ender 5 frame chilling the part.",
    ],
    fixes: [
      {
        action: "Add a brim",
        where: "OrcaSlicer › Support › Brim width (brim_width)",
        detail: "Set 3–5 mm to anchor the base edges. Peels off PLA easily; the highest-leverage anti-warp lever in the slicer.",
        impact: "high",
      },
      {
        action: "Clean the bed and confirm bed temperature",
        where: "OrcaSlicer › Filament › bed temperature (PLA ~55–60°C) + IPA wipe",
        detail: "A clean, warm plate is most of the battle.",
        impact: "medium",
      },
      {
        action: "Keep drafts away from the printer",
        where: "Hardware",
        detail: "Cold air across the open frame cools the part unevenly and lifts corners. Move it away from open windows / AC vents.",
        impact: "low",
      },
    ],
    primaryTest: "First-layer / Z-offset tuning plus a brim — warping is an adhesion/cooling problem, not a calibration-tower problem.",
    severity: "structural",
  },
  {
    id: "elephants-foot",
    symptom: "Elephant’s foot (flared base)",
    alsoCalled: ["elephant foot", "first-layer bulge", "flared bottom"],
    whatYouSee:
      "The bottom 1–3 layers flare out wider than the rest, like the base is squashed and spreading. Measuring across the very bottom gives a bigger number than higher up.",
    rootCauses: [
      "First layer over-squished by too low a Z-offset — the hot first layer gets crushed and spreads.",
      "Bed too hot for PLA keeps the lower layers soft so the weight above squashes them.",
      "Our profile already pre-mitigates with 0.1 mm elephant-foot compensation; if it still flares, the cause is Z-offset / bed temp.",
    ],
    fixes: [
      {
        action: "Raise the live Z-offset a touch",
        where: "Printer › live Z-offset baby-steps",
        detail: "Nudge up by +0.02 to +0.05 mm so the first layer is laid down less crushed. Re-run auto-level first if it’s uneven.",
        impact: "high",
      },
      {
        action: "Drop the PLA bed temperature a few degrees",
        where: "OrcaSlicer › Filament › bed temperature (PLA ~55–60°C)",
        detail: "Cooler lower layers stay firmer so the base doesn’t spread under the weight above. Combine with the Z-offset nudge.",
        impact: "medium",
      },
      {
        action: "Raise elephant-foot compensation as a fallback",
        where: "OrcaSlicer › Quality › Precision › Elephant foot compensation (elefant_foot_compensation)",
        detail: "If mechanical/Z fixes aren’t enough, raise 0.1 → 0.15–0.2 mm. Don’t overdo it — too much makes the base undersized.",
        impact: "low",
      },
    ],
    primaryTest: "First-layer / Z-offset tuning. Measure Z above the bottom 3 layers to confirm the flare is gone.",
    severity: "dimensional",
  },
  {
    id: "under-extrusion",
    symptom: "Under-extrusion (too little plastic)",
    alsoCalled: ["starved extrusion", "gaps in walls", "weak layers", "see-through walls"],
    whatYouSee:
      "Thin, weak-looking walls with visible gaps or pinholes between perimeters, lines that don’t fully fuse, and a cube that looks slightly translucent or undersized.",
    rootCauses: [
      "Nozzle temperature too low for the print speed, so filament can’t melt fast enough.",
      "Flow ratio slightly too low (ours is 0.95), or a partial clog / grinding in the Sprite gear.",
    ],
    fixes: [
      {
        action: "Raise nozzle temperature first",
        where: "OrcaSlicer › Filament › nozzle temperature (PLA ~200–215°C)",
        detail: "Bump +5–10°C so the hotend keeps up with flow. Run a Temperature Tower to pick the middle of the clean range.",
        impact: "high",
      },
      {
        action: "Calibrate flow ratio (don’t change E-steps from one cube)",
        where: "OrcaSlicer › Calibration › Flow Rate (Pass 1 then Pass 2)",
        detail: "If the calibrated value lands above 0.95, set it in Filament › Flow ratio. A constant error that doesn’t scale with part size is flow, not steps-per-mm.",
        impact: "medium",
      },
      {
        action: "Check the Sprite gear and PTFE for a partial clog",
        where: "Hardware",
        detail: "Inspect for ground filament dust on the drive gear and a seated PTFE tube. Clean if it persists after temp and flow are dialed.",
        impact: "medium",
      },
    ],
    primaryTest: "OrcaSlicer › Calibration › Flow Rate, preceded by a Temperature Tower (temperature governs flow, so do it first).",
    severity: "structural",
  },
  {
    id: "over-extrusion",
    symptom: "Over-extrusion (too much plastic)",
    alsoCalled: ["oversize walls", "rough top surface", "blobby surfaces"],
    whatYouSee:
      "Messy, bulged-looking surfaces, a rough or lumpy top, and a cube that measures oversize on BOTH X and Y by a similar small amount (e.g. 20.2–20.4 mm).",
    rootCauses: [
      "Flow ratio slightly too high (plus PLA die-swell), depositing more than the geometry needs.",
      "Nozzle temperature a touch high, making the melt ooze more.",
      "Tell: if BOTH X and Y are oversize by the SAME amount it’s flow, not motor calibration — don’t touch E-steps.",
    ],
    fixes: [
      {
        action: "Lower flow ratio via the Flow Rate calibration",
        where: "OrcaSlicer › Calibration › Flow Rate (filament_flow_ratio)",
        detail:
          "Run Pass 1 → Pass 2 and apply the value, OR compute from the cube: new flow = 0.95 × (20.0 / average of measured X and Y). Only when X and Y are oversize by the same amount.",
        impact: "high",
      },
      {
        action: "Drop nozzle temperature a few degrees",
        where: "OrcaSlicer › Filament › nozzle temperature",
        detail: "A few degrees cooler reduces ooze and surface roughness. Secondary to flow.",
        impact: "low",
      },
    ],
    primaryTest: "OrcaSlicer › Calibration › Flow Rate (Pass 1 → Pass 2). Never change E-steps from a single cube.",
    severity: "dimensional",
  },
  {
    id: "dimensional-skew",
    symptom: "Dimensional inaccuracy & skew",
    alsoCalled: ["wrong size", "out of square", "parallelogram", "axis mismatch"],
    whatYouSee:
      "Size: X, Y or Z don’t measure 20.00 mm. Skew: the top face is a leaning parallelogram — the two corner-to-corner diagonals come out unequal even if the flat sides measure fine.",
    rootCauses: [
      "Both X and Y oversize by the same amount = over-extrusion (fix flow, not motors).",
      "One axis off from the other (e.g. X=20.0, Y=20.3) = a per-axis belt-tension issue on that axis.",
      "Unequal diagonals = skew: X and Y not at 90°, from frame/assembly. Stock firmware has no skew compensation, so this is mechanical only.",
    ],
    fixes: [
      {
        action: "Measure correctly before changing anything",
        where: "Calipers (not eyeballing)",
        detail:
          "Jaws flat on opposing faces, 2–3 readings per axis avoiding the embossed letters and bottom 3 layers; average each axis. Measure BOTH top diagonals for skew. Inside 19.85–20.15 mm is good for a stock Ender — stop and print real parts.",
        impact: "high",
      },
      {
        action: "If both X and Y are oversize equally, lower flow ratio",
        where: "OrcaSlicer › Calibration › Flow Rate",
        detail: "Constant (non-scaling) oversize on both axes is flow/die-swell. Don’t “fix” a single-axis error with flow — that corrupts the good axis.",
        impact: "medium",
      },
      {
        action: "If one axis differs or diagonals are unequal, tension belts / square the frame",
        where: "Hardware",
        detail: "Single-axis size error: tension that axis’s belt (pluck it like a guitar string). Unequal diagonals: square the frame and even out belt tension — the only fix without skew compensation.",
        impact: "medium",
      },
    ],
    primaryTest: "Caliper measurement protocol (3 axes + both diagonals). Equal-axis oversize → Flow Rate; single-axis/skew → mechanical.",
    severity: "dimensional",
  },
  {
    id: "layer-shift",
    symptom: "Layer shift (offset chunk)",
    alsoCalled: ["layer shifting", "layer slip", "stepped print", "skipped layers"],
    whatYouSee: "Partway up, the upper layers are suddenly offset sideways from the lower ones, leaving a stepped ledge.",
    rootCauses: [
      "Belt slipping or a loose pulley grub screw on the X or Y motor shaft.",
      "Something snagging the gantry, or moving too fast/hot causing a skipped step.",
    ],
    fixes: [
      {
        action: "Tighten X/Y belts and the motor pulley set-screws",
        where: "Hardware",
        detail: "Tension both belts (taut, not over-tight) and check each pulley grub screw is seated on the flat of the motor shaft — the classic Ender layer-shift cause.",
        impact: "high",
      },
      {
        action: "Make sure nothing fouls the gantry travel",
        where: "Hardware",
        detail: "Check for cable drag, a warped print lifting into the nozzle, or binding V-wheels that stall a move mid-print.",
        impact: "medium",
      },
      {
        action: "Lower travel speed only if shifts persist",
        where: "OrcaSlicer › Speed › Travel speed (travel_speed)",
        detail: "Secondary lever — reduce it if mechanical fixes don’t fully resolve it. Fix the mechanics first.",
        impact: "low",
      },
    ],
    primaryTest: "No slicer test — this is mechanical. Tighten belts/pulleys and re-print to confirm.",
    severity: "critical",
  },
  {
    id: "ringing",
    symptom: "Ringing / ghosting (echo ripples)",
    alsoCalled: ["ghosting", "echoing", "rippling", "VFA"],
    whatYouSee:
      "Faint, repeating ripples that fan OUT and fade AWAY from a sharp corner or the embossed letters, across the flat wall. The pattern repeats and decays with distance. (A single lump ON the corner is bulging, not ringing.)",
    rootCauses: [
      "Mechanical vibration from fast direction changes — high acceleration/jerk, loose belts, loose V-wheel eccentric nuts, or a loose frame on the heavy Ender 5 gantry.",
      "Unlikely to be your main defect: our acceleration is already conservative, the ringing-suppressing regime. Suspect mechanics first.",
    ],
    fixes: [
      {
        action: "Confirm the artifact first",
        where: "Visual triage",
        detail: "Ripples trailing ALONG the wall after a corner = ringing. A raised lump ON the corner = bulging. Only proceed if you genuinely see the trailing wave train.",
        impact: "high",
      },
      {
        action: "Tighten belts, V-wheel eccentric nuts, and frame bolts",
        where: "Hardware",
        detail: "Belts should twang taut (not sag), but don’t over-tension. Eccentric nuts so wheels spin with light finger drag, no play. The mechanical cure for true ringing.",
        impact: "medium",
      },
      {
        action: "Run the VFA test, lower outer-wall speed below the artifact speed",
        where: "OrcaSlicer › Calibration › VFA test",
        detail: "The tower steps speed up a wall; read where the surface goes rough and treat it as a ceiling. We already run walls at 25 mm/s, so this rarely bites.",
        impact: "medium",
      },
    ],
    primaryTest: "OrcaSlicer › Calibration › VFA test, paired with a mechanical belt / eccentric-nut check.",
    severity: "cosmetic",
  },
  {
    id: "stringing",
    symptom: "Stringing / oozing",
    alsoCalled: ["oozing", "wisps", "hairs", "cobwebs"],
    whatYouSee:
      "Thin hairs or wisps of plastic stretched across gaps and between features (most visible around the embossed letters). Looks like spider web.",
    rootCauses: [
      "Nozzle too hot, so plastic keeps oozing during travel moves.",
      "Wet PLA that has absorbed moisture and sputters.",
      "Our committed retraction is 1 mm (lowered from 2) — a sensible Sprite direct-drive value; over-retracting risks grinding, so tune it rather than cranking it up.",
    ],
    fixes: [
      {
        action: "Lower nozzle temperature first",
        where: "OrcaSlicer › Filament › nozzle temperature",
        detail: "Drop 5–10°C for PLA — the most effective stringing fix. Use a Temperature Tower to find the lowest temp that still bonds well.",
        impact: "high",
      },
      {
        action: "Dry the filament if it’s damp",
        where: "Hardware",
        detail: "Damp PLA strings badly regardless of settings. Dry the spool (filament dryer or low oven) and re-test.",
        impact: "medium",
      },
      {
        action: "Run the Retraction test before increasing retraction",
        where: "OrcaSlicer › Calibration › Retraction test (retraction_length)",
        detail: "For a Sprite direct-drive the sweet spot is ~0.5–1.5 mm; our committed default is 1 mm (down from 2). Run the tower and adjust toward the cleanest value if you still string.",
        impact: "low",
      },
    ],
    primaryTest: "OrcaSlicer › Calibration › Temperature Tower, then the Retraction test (our committed 1 mm is a good Sprite starting point — tune from there).",
    severity: "cosmetic",
  },
  {
    id: "top-pillowing",
    symptom: "Top-layer gaps / pillowing",
    alsoCalled: ["pillowing", "top surface gaps", "holes in the top"],
    whatYouSee:
      "The flat top face has holes, fuzzy gaps, or a bumpy “pillowed” texture instead of a clean surface, as if the top didn’t fully close over the infill.",
    rootCauses: [
      "Not enough part cooling so the top skin sags into the infill gaps.",
      "Too few solid top layers (our 7 layers / 0.8 mm is already generous, so rarely the cause).",
      "Low flow leaving the top skin under-filled.",
    ],
    fixes: [
      {
        action: "Max PLA part cooling",
        where: "OrcaSlicer › Filament › Cooling › Max fan speed (fan_max_speed)",
        detail: "We pin this to 100% (the PLA base only inherits 80%). Good cooling lets the top skin bridge cleanly over infill.",
        impact: "high",
      },
      {
        action: "Verify flow isn’t low",
        where: "OrcaSlicer › Calibration › Flow Rate",
        detail: "An under-filled top skin can come from low flow — confirm the calibrated flow ratio before adding top layers.",
        impact: "medium",
      },
      {
        action: "Add top shell layers only if they’re thin",
        where: "OrcaSlicer › Quality › Top shell layers (top_shell_layers)",
        detail: "Our 7 layers / 0.8 mm is already strong, so this is a last resort. Check cooling and flow first.",
        impact: "low",
      },
    ],
    primaryTest: "No dedicated tower — the fix is cooling (fan to 100%), backed by a Flow Rate calibration to rule out under-fill.",
    severity: "cosmetic",
    note: "The committed profile now pins the fan to 100%, so new slices already get full cooling.",
  },
  {
    id: "seam-zits",
    symptom: "Seam blobs / zits",
    alsoCalled: ["seam blob", "zits", "Z-seam blob", "bulging seam"],
    whatYouSee:
      "A vertical line of small bumps or pimples up one edge where each layer starts and stops. Because our seam is “aligned,” they stack neatly on one corner.",
    rootCauses: [
      "Pressure/retraction behaviour at the layer start-stop point, worse because pressure advance is off (no pressure relief at the seam).",
      "Retraction length not yet dialed in (committed 1 mm is a reasonable Sprite default; tune to taste).",
      "Seam position “aligned” concentrates all the zits onto one visible edge.",
    ],
    fixes: [
      {
        action: "Tune retraction (committed 1 mm — sweep to the cleanest value)",
        where: "OrcaSlicer › Calibration › Retraction test (retraction_length)",
        detail: "Run the direct-drive retraction tower; PLA on a Sprite usually lands ~0.5–1.5 mm. Adjust from the committed 1 mm to cut seam zits and extruder skipping.",
        impact: "medium",
      },
      {
        action: "Move or scatter the seam off the measured faces",
        where: "OrcaSlicer › Quality › Seam › Seam position (seam_position)",
        detail: "Switch to “back” to push the seam onto the rear face, or “nearest” to scatter the zits so no single edge collects them all.",
        impact: "low",
      },
    ],
    primaryTest: "OrcaSlicer › Calibration › Retraction test (committed 1 mm is a sensible Sprite starting point).",
    severity: "cosmetic",
  },
];
