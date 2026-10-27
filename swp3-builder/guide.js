/* Plain-language guide to erosion and sediment controls used on Texas / TxDOT jobs.
   Sketches are schematic. Numbers that depend on a standard say to check the current sheet. */
(function (root) {
  'use strict';
  function fig(label, body) {
    return '<svg viewBox="0 0 320 168" role="img" aria-label="' + label + '">' + body + '</svg>';
  }
  var CATS = [
    { id: 'hold', title: 'Hold mud before it leaves', blurb: 'Sheet flow at the downhill edge, at inlets, and beside creeks.' },
    { id: 'ditch', title: 'Slow water in a ditch', blurb: 'Rock checks, traps, and basins for concentrated flow.' },
    { id: 'cover', title: 'Cover bare soil', blurb: 'Seed, mulch, blankets, and tracking so rain does not pick soil up.' },
    { id: 'move', title: 'Move water without a washout', blurb: 'Dikes, pipes, and rock at the pipe end.' },
    { id: 'road', title: 'Keep mud off the pavement', blurb: 'The exit and the street in front of it.' }
  ];
  var MEASURES = [
    {
      id: 'silt-fence', cat: 'hold', name: 'Silt fence', sheet: 'EC(1)-16',
      one: 'Fabric fence that drops mud out of sheet flow.',
      what: 'A temporary fence of woven fabric on posts. Water ponds for a moment on the uphill side and soil settles. It is a filter and a small dam for spread-out flow, not a dam for a ditch.',
      where: [
        'Along the downhill edge of disturbed ground, below the toe of a slope, and around a stockpile.',
        'Run it along the contour, so water meets the fence instead of running down beside it.',
        'The permit expects a perimeter control such as silt fence or a vegetated buffer on downhill edges of the work.',
        'Do not place it across a ditch, swale, or stream. Use a rock filter dam or another concentrated-flow control there.'
      ],
      install: [
        'The bottom has to be buried on the uphill side and tamped so water cannot run under the fabric.',
        'Turn the ends uphill so water cannot go around them.',
        'Join sections at a post, with an overlap, and not in a low spot.',
        'Item 506, as read for this tool, describes post spacing, embedment, and the trench. Use the current Item 506 and EC(1)-16 for those dimensions, and pick fabric from the TxDOT approved list.'
      ],
      maintain: [
        'Take out trapped soil before it reaches about half the height of the fence. That half-height rule is in the construction general permit.',
        'Fix tears, fallen posts, and places where water has cut under or around the fence. Replace a run that has been driven over.'
      ],
      mistakes: [
        'Setting the fence in a channel, where the flow knocks it flat.',
        'Leaving the bottom on top of the ground so water pipes underneath.',
        'Running the fence up and down the hill instead of across the slope.',
        'Letting one run serve a large drainage area. The TxDOT fact sheet used here does not recommend silt fence when more than about 2 acres drains to one run. Confirm that limit on the current fact sheet and add another control.',
        'Treating a full fence as finished. A fence buried in mud is no longer a fence.'
      ],
      confirm: 'Post spacing, trench size, and approved fabric are on the current EC(1)-16 sheet and Item 506. Check those before you put a dimension on a plan.',
      svg: fig('Cross section of a slope with a silt fence ponding muddy water on the uphill side',
        '<path d="M12 36 L230 118 L308 118 L308 150 L12 150 Z" fill="currentColor" opacity=".08"/>' +
        '<path d="M12 36 L230 118" fill="none" stroke="currentColor" stroke-width="2"/>' +
        '<path d="M132 96 L196 112 L186 124 L140 116 Z" fill="currentColor" opacity=".28"/>' +
        '<line x1="186" y1="124" x2="186" y2="58" stroke="currentColor" stroke-width="3"/>' +
        '<path d="M186 68 q10 8 0 16 q-10 8 0 16 q10 8 0 16" fill="none" stroke="currentColor" stroke-width="2"/>' +
        '<line x1="168" y1="78" x2="168" y2="120" stroke="currentColor" stroke-width="2"/>' +
        '<line x1="206" y1="86" x2="206" y2="124" stroke="currentColor" stroke-width="2"/>' +
        '<text x="16" y="28" fill="currentColor" font-size="14" font-family="system-ui,sans-serif">Sheet flow</text>' +
        '<text x="214" y="64" fill="currentColor" font-size="14" font-family="system-ui,sans-serif">Fence</text>' +
        '<text x="214" y="142" fill="currentColor" font-size="13" font-family="system-ui,sans-serif">Downhill side</text>')
    },
    {
      id: 'erosion-log', cat: 'hold', name: 'Erosion control log', sheet: 'EC(9)-16',
      one: 'A fiber log staked on the ground where fabric will not work.',
      what: 'A tube of straw, wood fiber, or similar material in a net, held down with stakes. It slows sheet flow the way a short silt fence does. On pavement, at a curb inlet, or on a slope, it is often the control that fits when you cannot trench in a fabric fence.',
      where: [
        'Perimeter of a stockpile, toe of a short slope, and along a curb.',
        'In front of a curb inlet or around a drop inlet, if it will not send water into traffic.',
        'As a small check in a ditch. On TxDOT sheets, logs used as ditch checks are spaced along the ditch. The spacing is on EC(9)-16, not a single distance for every slope.'
      ],
      install: [
        'Stake the log so water cannot get under it. Seams face downstream or up, as the sheet shows.',
        'On a slope, lay logs along the contour.',
        'At an inlet, leave a path for water so the street can still drain in a big storm.',
        'A log used as a small sediment trap has drainage-area and volume limits on the TxDOT fact sheet. Check the current sheet before you rely on a log for a large area.'
      ],
      maintain: [
        'Remove sediment before it buries the log. The TxDOT job aid used for this tool looks at about half the log diameter. Confirm that on the current job aid.',
        'Reset stakes after a storm and replace a log that has split or rolled.'
      ],
      mistakes: [
        'Using a log as the only control in a ditch that needs rock.',
        'Blocking a curb inlet solid, so the lane floods.',
        'Forgetting stakes, so the log floats to the fence line.',
        'Leaving the log in place after the area is paved and stable, where it becomes a trip hazard or a dam.'
      ],
      confirm: 'Log diameter, stake pattern, and ditch spacing are on the current EC(9)-16 sheet. Check that sheet rather than a catalog photo.',
      svg: fig('Fiber log staked along the contour of a slope, with water ponding above it',
        '<path d="M16 40 L300 130 L300 150 L16 150 Z" fill="currentColor" opacity=".08"/>' +
        '<path d="M16 40 L300 130" fill="none" stroke="currentColor" stroke-width="2"/>' +
        '<ellipse cx="168" cy="108" rx="54" ry="16" fill="currentColor" opacity=".2" stroke="currentColor" stroke-width="2"/>' +
        '<path d="M120 108 q12 -10 24 0 q12 10 24 0 q12 -10 24 0" fill="none" stroke="currentColor" stroke-width="1.5"/>' +
        '<line x1="140" y1="96" x2="132" y2="124" stroke="currentColor" stroke-width="2"/>' +
        '<line x1="196" y1="100" x2="188" y2="128" stroke="currentColor" stroke-width="2"/>' +
        '<path d="M70 86 L130 104 L120 116 L78 100 Z" fill="currentColor" opacity=".25"/>' +
        '<text x="16" y="28" fill="currentColor" font-size="14" font-family="system-ui,sans-serif">Along the contour</text>' +
        '<text x="200" y="96" fill="currentColor" font-size="14" font-family="system-ui,sans-serif">Log</text>')
    },
    {
      id: 'inlet-protection', cat: 'hold', name: 'Inlet protection', sheet: 'EC(9)-16 and EC(2)-16',
      one: 'Keeps mud out of a storm-drain inlet without flooding the road.',
      what: 'A temporary filter or small trap at a curb inlet, grate, or drop inlet. TxDOT uses erosion-control logs, rock, or a small sediment trap depending on the inlet. The point is to catch soil while the ground around the inlet is bare, and still let the street drain.',
      where: [
        'Inlets inside the work and inlets just outside it that will receive muddy water.',
        'Best where the inlet is in a low point and a little ponding is safe.',
        'On a slope, a curb inlet often will not hold a pond. Protection that blocks it just sends water farther down the gutter. Those inlets need a device that filters and still overflows.'
      ],
      install: [
        'Do not seal the opening. Leave an overflow so a storm can enter the inlet.',
        'Keep the device out of the wheel path when you can, and do not build something tall enough to hit a car or send water into the lane.',
        'The TxDOT fact sheets limit how much area one inlet trap should serve, and they give a storage volume. Those limits are on the current sheet. Check EC(9)-16 or EC(2)-16 for the inlet you actually have.',
        'Show the inlets on the SWP3 layout. The permit asks for inlets on and near the site to be on the map.'
      ],
      maintain: [
        'After rain, clear anything that has plugged the opening.',
        'Take out sediment before the device is about half full. Curb devices fill faster than they look.',
        'Remove the protection when the street is paved and the area no longer sheds mud, so it does not flood a finished road.'
      ],
      mistakes: [
        'Sandbags or boards that close the inlet with no way for water to get in.',
        'A gravel bag in the gutter on a grade, which only moves the mud to the next inlet.',
        'Forgetting inlets downstream of the exit, where tracking still reaches them.',
        'Leaving the device in place into the mowing season.'
      ],
      confirm: 'Which detail to use, and any height or volume limit, is on the current EC sheet for that inlet. Do not copy a detail from a different inlet type.',
      svg: fig('Curb inlet with a filter log in front and an overflow gap so the street can still drain',
        '<rect x="16" y="28" width="288" height="112" rx="8" fill="currentColor" opacity=".06" stroke="currentColor"/>' +
        '<rect x="188" y="70" width="70" height="46" fill="none" stroke="currentColor" stroke-width="2"/>' +
        '<path d="M198 78 h50 M198 90 h50 M198 102 h50" stroke="currentColor" stroke-width="1.5"/>' +
        '<ellipse cx="150" cy="100" rx="28" ry="12" fill="currentColor" opacity=".25" stroke="currentColor"/>' +
        '<path d="M40 96 h70" stroke="currentColor" stroke-width="2"/>' +
        '<path d="M104 90 l8 6 l-8 6" fill="none" stroke="currentColor" stroke-width="2"/>' +
        '<text x="28" y="52" fill="currentColor" font-size="14" font-family="system-ui,sans-serif">Gutter flow</text>' +
        '<text x="196" y="60" fill="currentColor" font-size="14" font-family="system-ui,sans-serif">Inlet</text>' +
        '<text x="96" y="132" fill="currentColor" font-size="13" font-family="system-ui,sans-serif">Filter, with a gap</text>')
    },
    {
      id: 'vegetated-buffer', cat: 'hold', name: 'Vegetated buffer', sheet: 'Summary sheet 2.6',
      one: 'A strip of existing grass between the work and the water.',
      what: 'A band of plants left in place so sheet flow crosses grass before it reaches a creek, pond, or wetland. The grass slows the water and catches soil. It is not a ditch liner and it is not a place to store spoil.',
      where: [
        'Where a stream, pond, or wetland is on or next to the right of way and you can leave a strip of cover.',
        'The permit asks you to keep a natural buffer around surface water and to send stormwater across vegetation, unless that is not feasible.',
        'If you cannot keep the buffer, write why, and show the controls you will use instead, with stationing. On a TxDOT summary sheet that finding can be one of the items that needs a seal.',
        'As a primary sediment control, the TxDOT fact sheet limits the area, the slope, and how long the flow path can be, and it wants a thick stand of plants. Check the current fact sheet. A thin or steep strip is not a buffer.'
      ],
      install: [
        'Mark the strip before clearing and keep trucks out of it.',
        'Send sheet flow into the grass. Do not cut a channel through it.',
        'If there is no surface water on or next to the site, the summary sheet says so in plain words. That is a normal answer, not a blank to avoid.'
      ],
      maintain: [
        'Pick up sediment that has buried the grass, and repair rills.',
        'Do not park, fuel, or stockpile on the strip.'
      ],
      mistakes: [
        'Calling a bare or freshly seeded strip a buffer.',
        'Letting a concentrated discharge cross the grass in one rut.',
        'Clearing to the top of the bank and adding fence later, with no note that the buffer would not fit.',
        'Counting a roadside ditch or a sediment trap as the "surface water" the buffer is for. The permit treats constructed stormwater features differently. Check the current permit wording.'
      ],
      confirm: 'Buffer width is site-specific. Check the current TxDOT fact sheet and summary-sheet guidance, and the permit, before you label a width on the layout.',
      svg: fig('Bare work area, a grass strip, and a creek, with sheet flow crossing the grass',
        '<rect x="16" y="36" width="120" height="100" fill="currentColor" opacity=".08" stroke="currentColor"/>' +
        '<rect x="136" y="36" width="80" height="100" fill="currentColor" opacity=".18" stroke="currentColor"/>' +
        '<path d="M216 36 h88 v100 h-88 z" fill="currentColor" opacity=".28"/>' +
        '<path d="M40 86 h90" stroke="currentColor" stroke-width="2"/>' +
        '<text x="28" y="28" fill="currentColor" font-size="13" font-family="system-ui,sans-serif">Bare work</text>' +
        '<text x="148" y="28" fill="currentColor" font-size="13" font-family="system-ui,sans-serif">Grass</text>' +
        '<text x="232" y="28" fill="currentColor" font-size="13" font-family="system-ui,sans-serif">Creek</text>' +
        '<text x="28" y="156" fill="currentColor" font-size="13" font-family="system-ui,sans-serif">Keep equipment off the grass</text>')
    },
    {
      id: 'rock-filter-dam', cat: 'ditch', name: 'Rock filter dam', sheet: 'EC(2)-16',
      one: 'A low rock berm across a ditch. This is the usual TxDOT check dam.',
      what: 'A mound of rock across a ditch, swale, or the toe of a slope. It slows concentrated flow so some soil drops out, and it keeps a ditch from cutting a deep rut. On the TxDOT summary sheet this is "rock filter dam / rock check dam." Types differ: some are lower and have no wire, some are wrapped in mesh, and a taller type is used where the flow calls for it. Sack gabions are another type.',
      where: [
        'Across a roadside ditch or a temporary swale, perpendicular to the flow.',
        'At the outlet of a diversion, and sometimes around an inlet (the lower type).',
        'Not as a substitute for a sediment basin when 10 or more acres are open in one drainage area and a basin will fit.',
        'Do not put an undersized rock berm in a live stream. In-stream work needs the type the sheet allows and whatever water permit the crossing requires.'
      ],
      install: [
        'Key the ends into the banks so water cannot cut around the dam.',
        'Use the rock size and height for the type. Item 506 and EC(2)-16, as read for this tool, describe types on the order of 18 inches and a taller meshed type on the order of 36 inches. Match the type to the ditch on the current sheet. Do not pick a height from memory.',
        'Side slopes are flat enough that rock stays put and, inside the clear zone, flat enough for a vehicle. The sheet gives the slopes.',
        'The TxDOT fact sheet sizes the dam from the 2-year flow. This guide does not do that math. If the velocity is high, a plain rock pile will wash out. Step up the type or the design.',
        'Space dams so water ponds between them: the top of the downstream dam lines up about with the toe of the next one up the ditch. Spacing depends on height and ditch slope. See the check-dam page and EC(2)-16.'
      ],
      maintain: [
        'Replace rock that has washed out, and repair torn mesh.',
        'Remove sediment that has filled the pond so the next storm still has room to slow down.',
        'Look harder after a fast storm. That is when the ends wash out.'
      ],
      mistakes: [
        'Rock too small for the speed of the water, so the dam becomes the sediment.',
        'A gap at the bank, which becomes the new channel.',
        'Dams so far apart that water is fast again before the next one.',
        'A dam tall enough to push water out of the ditch and onto the road.',
        'Driving through the dam because it was built in the haul path.'
      ],
      confirm: 'Type, rock size, height, and wire are on the current EC(2)-16 sheet and Item 506. Check those. This page does not assign a type for you.',
      svg: fig('Ditch seen from the side, with a rock berm holding a pool of water',
        '<path d="M16 120 L70 120 L110 78 L210 78 L250 120 L304 120" fill="none" stroke="currentColor" stroke-width="2"/>' +
        '<path d="M110 78 l14 28 h72 l14 -28" fill="currentColor" opacity=".22" stroke="currentColor" stroke-width="2"/>' +
        '<circle cx="132" cy="98" r="6" fill="none" stroke="currentColor"/><circle cx="150" cy="96" r="7" fill="none" stroke="currentColor"/><circle cx="170" cy="100" r="6" fill="none" stroke="currentColor"/><circle cx="188" cy="96" r="7" fill="none" stroke="currentColor"/>' +
        '<path d="M40 108 H124 Q150 96 124 108" fill="currentColor" opacity=".25"/>' +
        '<text x="16" y="36" fill="currentColor" font-size="14" font-family="system-ui,sans-serif">Flow</text>' +
        '<path d="M16 48 h48" stroke="currentColor" stroke-width="2"/>' +
        '<text x="168" y="64" fill="currentColor" font-size="14" font-family="system-ui,sans-serif">Rock</text>' +
        '<text x="36" y="148" fill="currentColor" font-size="13" font-family="system-ui,sans-serif">Pool on the upstream side</text>')
    },
    {
      id: 'check-dam', cat: 'ditch', name: 'Check dam', sheet: 'EC(2)-16 or EC(9)-16',
      one: 'A small dam across a ditch so water steps down instead of cutting.',
      what: 'Any low dam whose job is to slow water in a channel. On a TxDOT job the usual one is a rock filter dam, also called a rock check dam. An erosion-control log is used as a check where rock is a poor fit, such as a shallow swale or a place that will be mowed soon. The idea is the same: pond a little water, drop the soil, and keep the ditch from eroding.',
      where: [
        'Temporary ditches and swales that are carrying muddy water while the job is open.',
        'Not in a stream unless the sheet and the water permit allow it.',
        'The center of the dam should be lower than the ends, so if it overtops it overtops in the middle and not around the bank.'
      ],
      install: [
        'Spacing follows the ditch slope and the dam height. A practical picture: standing water should reach from one dam back to the toe of the next dam upstream. A steep ditch needs them closer. EC(2)-16 and EC(9)-16 show the spacing rule for the device you chose.',
        'Tie the ends into the ground. A check that water can walk around is a new bank failure.',
        'Do not build the dam so high that it backs water onto the pavement.'
      ],
      maintain: [
        'After storms, put rock or the log back where water moved it, and shovel out the pond when it is full of dirt.',
        'Take the checks out when the ditch is lined or vegetated and they are no longer doing work. A forgotten check can hold water in a finished ditch.'
      ],
      mistakes: [
        'Even spacing copied from the last job, on a ditch that is steeper.',
        'Straw bales used as checks. They rot, they float, and they are not the TxDOT rock or log detail.',
        'A check in the travel lane or in a driveway.',
        'No protection at the downstream end, so the last jump of water digs a hole.'
      ],
      confirm: 'There is no single spacing in feet that fits every ditch. Use the current EC sheet for rock filter dams or erosion-control logs, with the dam height and the ditch slope you have.',
      svg: fig('Three check dams in a ditch, with water ponding between them',
        '<path d="M16 40 L304 128" fill="none" stroke="currentColor" stroke-width="2" opacity=".45"/>' +
        '<path d="M70 56 l0 22 l18 -8 l18 8 l0 -22" fill="currentColor" opacity=".3" stroke="currentColor"/>' +
        '<path d="M150 84 l0 22 l18 -8 l18 8 l0 -22" fill="currentColor" opacity=".3" stroke="currentColor"/>' +
        '<path d="M230 112 l0 22 l18 -8 l18 8 l0 -22" fill="currentColor" opacity=".3" stroke="currentColor"/>' +
        '<path d="M20 64 H88" stroke="currentColor" stroke-width="3" opacity=".55"/>' +
        '<path d="M106 92 H168" stroke="currentColor" stroke-width="3" opacity=".55"/>' +
        '<path d="M186 120 H248" stroke="currentColor" stroke-width="3" opacity=".55"/>' +
        '<text x="16" y="28" fill="currentColor" font-size="14" font-family="system-ui,sans-serif">Steep ditch, dams closer together</text>' +
        '<text x="16" y="158" fill="currentColor" font-size="13" font-family="system-ui,sans-serif">Pond reaches the next dam</text>')
    },
    {
      id: 'sediment-trap', cat: 'ditch', name: 'Sediment trap', sheet: 'EC(6)-16',
      one: 'A small hole and a rock berm that settle mud from a ditch.',
      what: 'A shallow excavated pool with a rock embankment. Water from a ditch or an inlet slows down, soil drops, and water leaves over or through the rock. It is for a small drainage area. It is not a sediment basin and it does not replace a basin that the permit requires, unless the basin truly will not fit and the trap is part of the replacement you have written down.',
      where: [
        'In a ditch, just upstream of a ditch inlet, and before water leaves the right of way or enters a creek.',
        'The TxDOT summary guidance and EC(6)-16 limit how many acres one trap should drain, and they give a storage volume per acre. Check the current sheet. If the area is larger, use more than one trap or a basin.',
        'TxDOT also shows traps spaced along a long ditch. The spacing is on the current guidance, not a fixed number to reuse from an old plan.'
      ],
      install: [
        'The embankment is rock, with a protected overflow so a big storm does not flank the trap.',
        'Height, top width, and side slopes are on EC(6)-16. The fact sheet used here keeps the embankment low. Confirm the current limits before you draw one.',
        'Give the pool enough surface area. A deep narrow hole does not settle soil as well as a shallow wide one. The sheet has an area rule.',
        'Put the outlet where it will not erode the next ditch. A little rock on the downstream side is part of the detail.'
      ],
      maintain: [
        'Clean the trap when about half the storage is sediment. That is the permit rule. The TxDOT job aid also watches sediment depth. Use whichever comes first, and check the current job aid.',
        'Replace rock that has clogged with fines so water can still leave slowly instead of overtopping in a sheet.'
      ],
      mistakes: [
        'Calling a basin-sized problem a trap so you can skip the basin note.',
        'An earth berm with no rock outlet, which fails the first hard rain.',
        'Building the trap in the clear zone taller than the sheet allows.',
        'Never cleaning it, so it is full before the season that matters.'
      ],
      confirm: 'Drainage area, volume per acre, and embankment limits are on the current EC(6)-16 sheet and the TxDOT SWP3 summary guidance. Check both. This guide does not size the trap.',
      svg: fig('Small excavated trap with a rock berm and water leaving over the rock',
        '<path d="M16 70 H90 L120 120 H200 L230 70 H304" fill="currentColor" opacity=".08" stroke="currentColor" stroke-width="2"/>' +
        '<path d="M200 120 L230 70 L270 70 L250 120 Z" fill="currentColor" opacity=".22" stroke="currentColor"/>' +
        '<path d="M100 100 H210" stroke="currentColor" stroke-width="3" opacity=".45"/>' +
        '<text x="16" y="40" fill="currentColor" font-size="14" font-family="system-ui,sans-serif">Ditch in</text>' +
        '<text x="214" y="56" fill="currentColor" font-size="14" font-family="system-ui,sans-serif">Rock out</text>' +
        '<text x="120" y="152" fill="currentColor" font-size="13" font-family="system-ui,sans-serif">Shallow pool</text>')
    },
    {
      id: 'sediment-basin', cat: 'ditch', name: 'Sediment basin', sheet: 'EC(6)-16',
      one: 'A pond that holds muddy water long enough for soil to settle.',
      what: 'A larger pool with a controlled outlet. Stormwater sits, soil falls to the bottom, and clearer water leaves slowly. Where it is feasible, the construction general permit requires one when 10 or more acres are disturbed at one time in the same drainage area.',
      where: [
        'The low point of a drainage area that will have 10 or more acres bare at once.',
        'You can leave off-site and already-stable water out of the volume if you divert that water around the bare ground.',
        'TxDOT guidance says a basin should not drain more than a large upper limit of acres. Check the current summary-sheet guidance for that cap.',
        'An existing detention pond is usually a bad place to store construction mud unless it was designed for that and you can clean it.',
        'If a basin will not fit, write the reason and show equivalent controls, such as several smaller basins, traps, fence, or buffers. On the TxDOT sheet, "not feasible" is one of the notes that can require a seal.'
      ],
      install: [
        'Size it for the 2-year, 24-hour runoff from each disturbed acre. If you cannot calculate that storm, the permit uses 3,600 cubic feet per acre drained. Put the math in the SWP3.',
        'TxDOT notes sometimes quote a smaller volume for traps and for smaller basins. If this basin is how you meet the permit, use the permit volume, not the smaller number.',
        'The permit wants an outlet that draws water from the surface when that is feasible, so the mud at the bottom stays in the basin.',
        'Include a way for a big storm to leave without washing out the embankment. TxDOT sheets talk about drawdown time and an emergency spillway. Those details are on the current EC(6)-16 and the SWP3 guidance. This guide does not calculate them.',
        'A long flow path through the pool works better than a square hole. The guidance describes a length-to-width preference. Check the current note.'
      ],
      maintain: [
        'Remove sediment when about half the design volume is full of soil. That is the permit rule. Do not wait until the outlet is buried.',
        'Watch the discharge. If it is obviously muddy, the basin or the outlet is not doing its job.',
        'Keep the embankment free of trees and animal holes, and keep the spillway clear.'
      ],
      mistakes: [
        'No basin, and no written reason, on a site with 10 acres open in one watershed.',
        'A hole with a pipe at the bottom that releases the muddiest water first.',
        'Volume copied from a trap note (the smaller per-acre number) and called a permit basin.',
        'No math in the SWP3.',
        'Building it after the clearing instead of before the dirt starts to move.'
      ],
      confirm: 'Outlet, drawdown, spillway, and embankment rules are on the current EC(6)-16 sheet and TxDOT SWP3 guidance. Volume for a permit basin comes from the current TCEQ construction general permit. Check both. Do not size it from this page.',
      svg: fig('Sediment basin with inflow, a surface outlet, and an emergency spillway',
        '<path d="M24 64 H70 L110 130 H230 L270 64 H300" fill="currentColor" opacity=".1" stroke="currentColor" stroke-width="2"/>' +
        '<path d="M90 110 H240" stroke="currentColor" stroke-width="3" opacity=".4"/>' +
        '<rect x="168" y="78" width="10" height="52" fill="none" stroke="currentColor" stroke-width="2"/>' +
        '<line x1="160" y1="86" x2="186" y2="86" stroke="currentColor" stroke-width="2"/>' +
        '<path d="M270 64 q20 8 16 28" fill="none" stroke="currentColor" stroke-width="2"/>' +
        '<text x="16" y="40" fill="currentColor" font-size="13" font-family="system-ui,sans-serif">Muddy in</text>' +
        '<text x="140" y="56" fill="currentColor" font-size="13" font-family="system-ui,sans-serif">Surface outlet</text>' +
        '<text x="214" y="48" fill="currentColor" font-size="13" font-family="system-ui,sans-serif">Spillway</text>' +
        '<text x="100" y="156" fill="currentColor" font-size="13" font-family="system-ui,sans-serif">Soil settles on the bottom</text>')
    },
    {
      id: 'seeding-mulch', cat: 'cover', name: 'Seeding, mulch, and sod', sheet: 'Items 162, 164, and 169 notes',
      one: 'Cover bare soil with plants, and mulch to hold it until the plants take.',
      what: 'Temporary seeding and mulch protect ground that will sit still during the job. Permanent seeding or sod is the final cover on areas that will not be paved. Mulch, including hydromulch, holds seed and soil against rain. Mulch by itself is not final stabilization.',
      where: [
        'Every disturbed area that will not be under pavement or a structure, once you are done grading that piece.',
        'Start as soon as work in an area stops. The permit says to begin stabilization by the end of the next work day when work has stopped and will not resume for more than 14 days, and to finish within 14 days after you start. TxDOT Item 506 wording is looser. Use the permit timing.',
        'Final stabilization means a uniform perennial cover on the unpaved areas, about 70 percent of the native background cover, or something equivalent such as riprap. That definition is in the permit.'
      ],
      install: [
        'Seed mix, rate, season, and fertilizer belong in the plans under the current TxDOT items for seeding and sodding, often with topsoil or compost. Do not invent a rate here. Check Items 162 and 164 and the district seed list.',
        'Mulch steep or sandy spots the same day you seed. Seed without cover washes off the first rain.',
        'Keep a record of when grading stopped and when stabilization started. TxDOT inspection forms ask for that.',
        'Sod where you need cover now, such as a ditch that will see flow before seed could grow.'
      ],
      maintain: [
        'Re-seed bare spots and keep traffic off the area while it establishes.',
        'Water if the specification says to. Do not assume rain will finish the job.',
        'The permit is not over when the contractor is accepted if the cover is not actually there. Keep inspecting until final stabilization, and until the notice of termination on a large site.'
      ],
      mistakes: [
        'Waiting weeks after grading because the schedule says "seed at the end."',
        'Calling a job finished on a stand that is still mostly bare soil.',
        'Hydromulch on a ditch that needs a blanket, so the mulch ends up downstream.',
        'Using a temporary annual grass and never coming back with permanent cover.',
        'Driving haul trucks across the new seed.'
      ],
      confirm: 'Seed mixes and rates change by district and season. Use the current TxDOT specifications and the plan set. Timing and the 70 percent cover rule are in the current TCEQ construction general permit. Check that permit if you are writing a note.',
      svg: fig('Bare slope next to a slope with seed and mulch cover',
        '<path d="M16 120 L150 40 L150 140 L16 140 Z" fill="currentColor" opacity=".08" stroke="currentColor"/>' +
        '<path d="M170 140 L170 40 L304 120 L304 140 Z" fill="currentColor" opacity=".16" stroke="currentColor"/>' +
        '<path d="M190 110 l8 -16 l8 16 M220 100 l8 -18 l8 18 M250 112 l8 -14 l8 14" fill="none" stroke="currentColor" stroke-width="1.5"/>' +
        '<text x="28" y="132" fill="currentColor" font-size="13" font-family="system-ui,sans-serif">Bare</text>' +
        '<text x="196" y="132" fill="currentColor" font-size="13" font-family="system-ui,sans-serif">Seed and mulch</text>')
    },
    {
      id: 'blanket', cat: 'cover', name: 'Erosion control blanket', sheet: 'Item 169',
      one: 'A mat pinned over soil or seed on a slope or in a ditch.',
      what: 'A blanket or mat, often called a soil retention blanket on TxDOT jobs, pinned over bare soil or fresh seed. It holds the soil until plants grow. Slope products and channel products are not the same. A ditch that will carry water needs a blanket rated for that flow.',
      where: [
        'Slopes, fill transitions, ditch bottoms, and ground next to a creek.',
        'Steep or easily eroded soil needs a blanket sooner than flat ground. Whether a given slope gets one is a design choice on the plans, not a single slope ratio from this app.',
        'Pick the product from the current TxDOT approved list for soil retention blankets.'
      ],
      install: [
        'Follow the manufacturer and Item 169. Anchor the top in a trench so water cannot get under the mat, overlap in the direction of flow, and pin on the pattern the product requires.',
        'Put seed down before the blanket if the blanket is there to establish vegetation.',
        'Use a wildlife-friendly product where the plans or the area call for it.',
        'The permit still expects you to start stabilization on the permit schedule. A blanket is one way to do that. It does not add extra days.'
      ],
      maintain: [
        'Pin back any edge that has lifted, and patch spots where soil is exposed.',
        'Keep vehicles off it. Tires tear the mat and make a rut that water will follow.'
      ],
      mistakes: [
        'No trench at the top, so the first rain peels the whole blanket downhill.',
        'Overlaps facing the wrong way, so each joint is a scoop.',
        'A light slope blanket in a ditch that needs a channel mat.',
        'Staking so far apart that the mat balloons and fails.',
        'Covering a rut instead of filling it. The blanket then hides the problem until it opens up.'
      ],
      confirm: 'Product type, staple pattern, and where blankets are required are on the plans and the current Item 169 approved list. Check those. Do not assume every 3:1 slope gets the same mat.',
      svg: fig('Blanket on a slope, trenched at the top and overlapped downhill',
        '<path d="M40 28 L260 140 L40 140 Z" fill="currentColor" opacity=".08" stroke="currentColor"/>' +
        '<path d="M70 48 h40 v16 h-40 z" fill="none" stroke="currentColor" stroke-width="2"/>' +
        '<path d="M78 64 L200 130" stroke="currentColor" stroke-width="6" opacity=".35"/>' +
        '<path d="M96 70 L220 136" stroke="currentColor" stroke-width="6" opacity=".35"/>' +
        '<circle cx="120" cy="86" r="3" fill="currentColor"/><circle cx="150" cy="104" r="3" fill="currentColor"/><circle cx="180" cy="122" r="3" fill="currentColor"/>' +
        '<text x="118" y="44" fill="currentColor" font-size="13" font-family="system-ui,sans-serif">Top trench</text>' +
        '<text x="150" y="78" fill="currentColor" font-size="13" font-family="system-ui,sans-serif">Overlap</text>')
    },
    {
      id: 'vertical-tracking', cat: 'cover', name: 'Vertical tracking', sheet: 'EC(1)-16',
      one: 'Grooves across a slope so water does not run straight down.',
      what: 'The tracks of a machine pressed across the slope, not up and down it. Each groove holds a little water and seed. TxDOT Item 506 calls for this on slopes where soil is being disturbed, unless the engineer approves something else. It is temporary. It is not a substitute for seed, fence, or a blanket on a slope that needs them.',
      where: [
        'The face of a slope you just graded and have not covered yet.',
        'Show on the plans where it is required. It is hard to enforce if it is only a general note.'
      ],
      install: [
        'Drive along the contour so the grooves run across the slope. Up-and-down tracks become rills.',
        'Item 506 describes the length, width, depth, and spacing of the grooves. Check the current item for those numbers. Do not compact the slope into a hard crust. A few passes are enough.',
        'Track as you go. Tracking a slope weeks later, after it has already rilled, does not put the soil back.'
      ],
      maintain: [
        'Re-track after a hard rain if the grooves have washed out, and get seed or a blanket on the slope if tracking will not hold it.',
        'Do not use tracking alone next to a creek if the slope is already failing.'
      ],
      mistakes: [
        'Tracking up and down the hill, which builds a set of ditches.',
        'So many passes that the soil is glazed and seed cannot take.',
        'Skipping it on a short slope because it "does not look steep." The specification is about disturbed slopes, not a picture in your head.',
        'Leaving tracked soil bare through a whole rainy month.'
      ],
      confirm: 'Groove size and where tracking is mandatory are in the current Item 506 and on EC(1)-16. Check those before you change the note.',
      svg: fig('Slope with grooves running across it, and an arrow showing the wrong up-and-down direction crossed out',
        '<path d="M36 36 L250 140 L36 140 Z" fill="currentColor" opacity=".08" stroke="currentColor"/>' +
        '<path d="M60 70 h150 M70 90 h150 M80 110 h140" stroke="currentColor" stroke-width="3" opacity=".7"/>' +
        '<text x="70" y="58" fill="currentColor" font-size="13" font-family="system-ui,sans-serif">Grooves across the slope</text>' +
        '<text x="40" y="158" fill="currentColor" font-size="13" font-family="system-ui,sans-serif">Not up and down the hill</text>')
    },
    {
      id: 'keep-vegetation', cat: 'cover', name: 'Keep existing vegetation', sheet: 'Perimeter fence, Item 506',
      one: 'The best erosion control is ground you never cleared.',
      what: 'Mark trees, grass, and creek banks that stay, and keep machines out. A construction perimeter fence is the usual TxDOT way to show the line. Once the root zone is compacted or the bank is cleared, you are in the business of replacing cover, which is slower and weaker.',
      where: [
        'Trees, steep woods, and the banks of creeks and wetlands.',
        'Put the fence up before clearing, not after the first dozer pass.',
        'The permit says to preserve existing vegetation where you can.'
      ],
      install: [
        'Fence the area so a driver can see it. Item 506 describes post depth and fence height for construction perimeter fence. Check the current item for the dimensions.',
        'Keep the fence outside the trunks, not tied to them.',
        'Decide the haul route first so you are not fencing across the only way in.'
      ],
      maintain: [
        'Stand the fence back up when it is hit. A fence on the ground is permission.',
        'Do not store soil, fuel, or equipment inside the marked area.'
      ],
      mistakes: [
        'Ribbon on a few trees and no fence, which disappears the first week.',
        'Trenching through the root zone you meant to save.',
        'Using silt fence as the "do not enter" fence. It gets buried and people drive over it.',
        'Clearing a wider strip than the slope actually needs.'
      ],
      confirm: 'Fence materials and post spacing are in the current Item 506. Check it. What to save is a plan decision, agreed before clearing.',
      svg: fig('Trees inside a high-visibility fence, with equipment kept outside',
        '<rect x="70" y="40" width="160" height="100" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="6 4"/>' +
        '<circle cx="130" cy="78" r="16" fill="none" stroke="currentColor" stroke-width="2"/>' +
        '<line x1="130" y1="94" x2="130" y2="124" stroke="currentColor" stroke-width="2"/>' +
        '<circle cx="176" cy="70" r="18" fill="none" stroke="currentColor" stroke-width="2"/>' +
        '<line x1="176" y1="88" x2="176" y2="124" stroke="currentColor" stroke-width="2"/>' +
        '<rect x="16" y="100" width="36" height="22" fill="currentColor" opacity=".25" stroke="currentColor"/>' +
        '<text x="16" y="32" fill="currentColor" font-size="13" font-family="system-ui,sans-serif">Fence before you clear</text>' +
        '<text x="16" y="156" fill="currentColor" font-size="13" font-family="system-ui,sans-serif">Equipment stays outside</text>')
    },
    {
      id: 'stockpile', cat: 'cover', name: 'Stockpile protection', sheet: 'Stockpile fact sheet',
      one: 'A pile of soil is bare ground. Treat it like the rest of the site.',
      what: 'Topsoil, spoil, aggregate, and similar piles shed mud and dust. Give each pile a place on the layout, keep it out of ditches and away from inlets, and cover it or ring it with silt fence or logs. A pile you will not use within 14 days is inactive. The TxDOT fact sheet treats inactive piles as something you stabilize or cover.',
      where: [
        'A marked spot away from concentrated flow, inlets, and creeks.',
        'Not at the low point of the job, and not on the vegetated buffer.'
      ],
      install: [
        'Downhill side gets a sediment control. If the pile will sit, cover it or seed it.',
        'The job aid used here says to remove sediment when it reaches about one-third of the control height, and to cover the pile at the end of the day. Confirm that on the current job aid.',
        'Say in the plans how long a pile may sit before it has to be covered.'
      ],
      maintain: [
        'Fix torn covers before rain, not after.',
        'If a pile is in use, keep the downhill control cleaned out. Active piles still erode.'
      ],
      mistakes: [
        'Spoil pushed to the right-of-way line with no fence, because it is "temporary."',
        'A stockpile in the ditch, which becomes the new sediment source for every inlet downstream.',
        'A cover that does not reach the ground, so wind takes the fines off the bottom.',
        'Topsoil piled for months, then found full of weeds and rills when you need it.'
      ],
      confirm: 'Cover timing and how you pay for stockpile controls follow the current TxDOT fact sheet and the plans. Check those. Fourteen days is the fact-sheet idea of an inactive pile as read for this tool. Confirm it before you write the note.',
      svg: fig('Soil stockpile with a cover and a silt fence on the downhill side',
        '<path d="M70 120 L150 48 L230 120 Z" fill="currentColor" opacity=".12" stroke="currentColor" stroke-width="2"/>' +
        '<path d="M96 96 L150 56 L204 96" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="5 3"/>' +
        '<line x1="210" y1="120" x2="210" y2="78" stroke="currentColor" stroke-width="3"/>' +
        '<path d="M210 86 q8 6 0 12 q-8 6 0 12" fill="none" stroke="currentColor"/>' +
        '<text x="16" y="36" fill="currentColor" font-size="14" font-family="system-ui,sans-serif">Cover</text>' +
        '<text x="222" y="100" fill="currentColor" font-size="13" font-family="system-ui,sans-serif">Fence</text>' +
        '<text x="90" y="148" fill="currentColor" font-size="13" font-family="system-ui,sans-serif">Out of the ditch</text>')
    },
    {
      id: 'diversion', cat: 'move', name: 'Diversion dike or swale', sheet: 'EC(4)-16, EC(5)-16, EC(8)-16',
      one: 'Sends clean water around the bare ground, or muddy water to a trap.',
      what: 'A low ridge of compacted soil, a shallow swale, or a paved flume that intercepts water. Use it to keep uphill clean water off the work, or to carry muddy water to a trap or basin instead of down a raw slope. A dike without a stable place for the water to go just moves the washout.',
      where: [
        'Along the top of a slope, at the edge of pavement, and anywhere run-on would cross bare soil.',
        'The TxDOT fact sheet limits how much area one swale or dike should collect. Check the current sheet. If the area is bigger, split it.',
        'Inside the clear zone, side slopes have to be flat enough for a vehicle. The sheet gives that slope. Check it.',
        'Outlet onto rock, a trap, a basin, or a vegetated area that can take the flow. Not onto a raw fill.'
      ],
      install: [
        'Compact an earth dike. A loose windrow washes out and adds to the sediment.',
        'Grade the swale so it does not pond against the road or a neighbor.',
        'A paved flume is for a steep drop. Size it for the storm the fact sheet names, and put rock at the bottom. Check EC(8)-16 and Item 506 for the current design storm and dimensions.',
        'Build diversions before you strip the ground below them.'
      ],
      maintain: [
        'Repair low spots and animal paths the same week they appear.',
        'Clean silt out of the swale so it still has capacity.',
        'Keep the outlet rock in place. The outlet is where these fail.'
      ],
      mistakes: [
        'A dike that ends in the middle of a fill slope.',
        'Clean water and muddy water mixed in the same swale, so you treat water you could have kept clean.',
        'A dike used as a haul road until it is a rut.',
        'No freeboard, so a modest storm overtops and cuts a new channel.'
      ],
      confirm: 'Height, side slopes, drainage area, and the design storm for a paved flume are on the current EC sheets and Item 506. Check those. This page does not size a channel.',
      svg: fig('Ridge at the top of a slope turning water sideways to a rock outlet',
        '<path d="M16 50 H250 L300 130" fill="none" stroke="currentColor" stroke-width="2"/>' +
        '<path d="M40 50 q20 -16 40 0 q20 16 40 0 q20 -16 40 0" fill="currentColor" opacity=".2" stroke="currentColor"/>' +
        '<path d="M24 70 h150" stroke="currentColor" stroke-width="2" opacity=".7"/>' +
        '<circle cx="286" cy="138" r="10" fill="none" stroke="currentColor"/><circle cx="274" cy="146" r="7" fill="none" stroke="currentColor"/>' +
        '<text x="16" y="32" fill="currentColor" font-size="14" font-family="system-ui,sans-serif">Dike</text>' +
        '<text x="200" y="150" fill="currentColor" font-size="13" font-family="system-ui,sans-serif">To a stable outlet</text>')
    },
    {
      id: 'slope-drain', cat: 'move', name: 'Pipe slope drain', sheet: 'EC(7)-16',
      one: 'A pipe that carries water down a raw slope so the slope does not rill.',
      what: 'A temporary pipe from the top of a slope to the bottom. Water is collected at the top, rides the pipe, and comes out at a stable pad or a trap. The pipe does not clean the water. It only keeps the slope from eroding. Something at the outlet has to deal with the sediment and the speed.',
      where: [
        'Long raw embankments, berms, and steep grades where water would otherwise run down the face.',
        'The TxDOT fact sheet limits the area one drain should serve. Check the current sheet. More area means another pipe or a different plan.',
        'Not as a permanent storm-sewer substitute, and not dumped at the top of another bare slope.'
      ],
      install: [
        'The inlet needs a berm so water enters the pipe instead of going around it. The fact sheet used here calls for the berm to stand above the pipe. Check EC(7)-16 for how far, and for anchor spacing.',
        'Hold the pipe down the slope so it cannot roll or separate at the joints.',
        'The outlet needs rock or a trap. A bare splash pad will dig a hole.',
        'The fact sheet allows a stated design storm for sizing. Check the current sheet. This guide does not pick a diameter.'
      ],
      maintain: [
        'Clear trash at the inlet. A clogged pipe sends the water down the slope you were protecting.',
        'Repair separated joints and a berm that has settled.',
        'Re-anchor the pipe if it has shifted. A loose pipe is a hose.'
      ],
      mistakes: [
        'No berm at the top, so water misses the pipe.',
        'Outlet on bare soil.',
        'Pipe too small, with water jumping the inlet in an ordinary storm.',
        'Using the pipe after the slope is vegetated and forgetting to remove it, or removing it and leaving a rut down the face.'
      ],
      confirm: 'Pipe size, inlet berm height, and anchor spacing are on the current EC(7)-16 sheet and Item 506. Check those before you call out a diameter.',
      svg: fig('Berm and pipe inlet at the top of a slope, pipe down the face, rock at the outlet',
        '<path d="M24 40 H120 L280 140 H24 Z" fill="currentColor" opacity=".08" stroke="currentColor"/>' +
        '<path d="M40 48 q16 -14 32 0" fill="currentColor" opacity=".25" stroke="currentColor"/>' +
        '<path d="M78 52 C120 70 180 100 250 132" fill="none" stroke="currentColor" stroke-width="4"/>' +
        '<circle cx="262" cy="142" r="8" fill="none" stroke="currentColor"/><circle cx="278" cy="148" r="6" fill="none" stroke="currentColor"/>' +
        '<text x="24" y="28" fill="currentColor" font-size="13" font-family="system-ui,sans-serif">Berm and inlet</text>' +
        '<text x="180" y="40" fill="currentColor" font-size="13" font-family="system-ui,sans-serif">Pipe</text>' +
        '<text x="16" y="162" fill="currentColor" font-size="13" font-family="system-ui,sans-serif">Rock at the bottom</text>')
    },
    {
      id: 'outlet-protection', cat: 'move', name: 'Outlet protection', sheet: 'EC(8)-16',
      one: 'Rock at a pipe end so the discharge does not dig a hole.',
      what: 'Riprap or another dissipator at a culvert, flume, or ditch outlet. Fast water leaves the pipe, hits the rock, and slows down before it reaches erodible soil or a natural channel. The permit requires velocity dissipation at discharge points and along outfall channels so the flow is not erosive.',
      where: [
        'Culvert and storm-drain outlets, paved flumes, and the end of a diversion.',
        'The TxDOT fact sheet used here says to protect outlets where the design velocity is high and the receiving channel is unlined. Check the current fact sheet for the velocity that triggers it.',
        'Install the permanent dissipator early if you can, so it protects the site during construction and not only after acceptance.'
      ],
      install: [
        'The apron is aligned with the flow, not dumped in a pile beside the pipe.',
        'Length, width, and rock size depend on the pipe and the velocity. The fact sheet describes an apron in terms of pipe diameters and points at Item 432 for riprap. Check the current fact sheet and Item 432. Do not reuse a thickness from another culvert.',
        'Where the outlet is much higher than the channel, rock on a flat apron is the wrong tool. You need a drop or a stilling arrangement the hydraulic design actually calls for.',
        'Put filter fabric or bedding under the rock if the sheet shows it, so soil does not pipe up through the voids.'
      ],
      maintain: [
        'Put displaced rock back and fill scour at the edges.',
        'Clear sediment that has choked the apron. A buried apron is just a ramp for the next storm.',
        'Look at outlets on every inspection. The permit calls out discharge points specifically.'
      ],
      mistakes: [
        'A few square yards of rock that do not match the pipe size, so the plunge pool forms just past the rock.',
        'Rock dumped above the pipe invert, which blocks the pipe.',
        'No rock because the permanent channel "will be lined later," while the culvert is already flowing.',
        'Geotextile exposed and flapping because the rock layer is too thin.'
      ],
      confirm: 'Apron size and stone class are a hydraulic decision. Use the current EC(8)-16 sheet, Item 432, and the culvert design. This page does not pick a rock gradation.',
      svg: fig('Pipe outlet with a fan of riprap where the water hits the ground',
        '<rect x="16" y="70" width="90" height="28" fill="none" stroke="currentColor" stroke-width="2"/>' +
        '<path d="M106 70 L220 40 L220 128 L106 98 Z" fill="currentColor" opacity=".12" stroke="currentColor"/>' +
        '<circle cx="140" cy="84" r="7" fill="none" stroke="currentColor"/><circle cx="160" cy="74" r="6" fill="none" stroke="currentColor"/><circle cx="168" cy="96" r="8" fill="none" stroke="currentColor"/><circle cx="190" cy="84" r="7" fill="none" stroke="currentColor"/>' +
        '<text x="16" y="56" fill="currentColor" font-size="14" font-family="system-ui,sans-serif">Pipe</text>' +
        '<text x="16" y="152" fill="currentColor" font-size="13" font-family="system-ui,sans-serif">Rock apron, in line with the flow</text>')
    },
    {
      id: 'dewatering', cat: 'move', name: 'Dewatering', sheet: 'Special specification for bags, where used',
      one: 'Pump muddy trench water through a filter, not into the inlet.',
      what: 'Water pumped from a trench, excavation, or pit. The permit does not allow that discharge unless you control the sediment and keep the outlet from eroding. A filter bag, a tank, a vegetated strip, or a trap can do it. The hose by itself is not a control.',
      where: [
        'Anywhere you will pump: utility trenches, culvert excavations, low piers.',
        'Show the planned locations on the layout, including where the water finally goes.',
        'The bag or tank sits on the ground where a leak will not run straight into a creek. A vegetated area or a trap is the usual last step.'
      ],
      install: [
        'Match the filter to the pump. The TxDOT dewatering-bag specification used for this tool says the bag should pass at least twice the pump\'s peak flow. Confirm that on the current special specification before you order a bag.',
        'A sediment tank should hold the discharge long enough for soil to drop. The fact sheet describes a detention time. Check it.',
        'Stake the bag and aim the discharge at the ground, not at a slope that will rill.',
        'If the water is not just mud (sheen, sewage, concrete wash), a sediment bag is the wrong tool. Stop and deal with the pollutant.'
      ],
      maintain: [
        'Replace a bag when it is about half full of sediment. That is the job-aid rule used here. Confirm it on the current job aid.',
        'On days you are pumping, look at the discharge that day. The permit requires a daily look and a report. TxDOT has a dewatering inspection form for the contractor.',
        'The job aid also asks whether the local MS4 was told about the dewatering. Check the current form and the project\'s MS4 requirements.'
      ],
      mistakes: [
        'The intake hose in the trench and the outlet hose in the inlet, with nothing in between.',
        'A bag sitting in the ditch, so "filtered" water immediately picks up more mud.',
        'A bag too small for the pump, which bursts or is bypassed by the crew.',
        'Pumping concrete saw-cut water or sludge through a sediment bag.',
        'No one assigned to look at it because "it is only for an hour."'
      ],
      confirm: 'Bag size, tank time, and the daily form are in the current TxDOT dewatering specification and the permit\'s dewatering section. Check those. Do not copy a bag size from this page.',
      svg: fig('Trench, pump, and a filter bag discharging onto grass rather than into an inlet',
        '<rect x="16" y="70" width="70" height="50" fill="currentColor" opacity=".12" stroke="currentColor"/>' +
        '<rect x="36" y="48" width="28" height="22" fill="none" stroke="currentColor" stroke-width="2"/>' +
        '<path d="M64 58 H120" stroke="currentColor" stroke-width="2"/>' +
        '<ellipse cx="168" cy="70" rx="40" ry="18" fill="currentColor" opacity=".2" stroke="currentColor" stroke-width="2"/>' +
        '<path d="M200 78 H250" stroke="currentColor" stroke-width="2"/>' +
        '<rect x="250" y="60" width="54" height="70" fill="currentColor" opacity=".14" stroke="currentColor"/>' +
        '<text x="16" y="40" fill="currentColor" font-size="13" font-family="system-ui,sans-serif">Trench</text>' +
        '<text x="140" y="48" fill="currentColor" font-size="13" font-family="system-ui,sans-serif">Bag</text>' +
        '<text x="248" y="48" fill="currentColor" font-size="13" font-family="system-ui,sans-serif">Grass</text>')
    },
    {
      id: 'construction-exit', cat: 'road', name: 'Construction exit', sheet: 'EC(3)-16',
      one: 'A rock pad where trucks leave the dirt and enter the paved road.',
      what: 'A stabilized exit, usually rock, sometimes with timbers or a cattle guard, that knocks mud off tires. It is the control for tracking. It does not vacuum the road. You still sweep. The permit requires you to minimize mud and dust carried off the site, and to show the exits on the map.',
      where: [
        'Every place vehicles leave onto pavement.',
        'The TxDOT fact sheet used here says a stabilized exit is required when the project disturbs one acre or more, and is recommended on smaller jobs where tracking is likely. Confirm that on the current fact sheet.',
        'One exit is better than three gaps in the fence. Put the exit where the haul road actually is.'
      ],
      install: [
        'Item 506 and the fact sheet, as read for this tool, describe a rock exit on the order of 8 inches of coarse rock, wide enough for the trucks, and long enough that tires turn several times. Widths on the order of 14 feet for one-way and 20 feet for two-way, and a length on the order of 50 feet for the longer types, are what that text describes. Use the current EC(3)-16 and Item 506. A short thin pad does not work, and the sheet may have been revised.',
        'The approach should not be so steep that trucks drag mud over the rock. The fact sheet gives a slope limit. Check it.',
        'Drain the pad to a trap or another sediment control, not into the gutter.',
        'Do not wash tires into the street. Washing is how mud gets into the storm drain with extra water behind it.'
      ],
      maintain: [
        'Add rock when the pad is full of mud and the tires are riding on dirt again.',
        'Sweep the public road. The exit and the broom are a pair. See street sweeping.',
        'Close unofficial exits. A perfect pad does nothing if trucks leave through the ditch.'
      ],
      mistakes: [
        'A pad shorter than the truck, so the trailer tires never touch it.',
        'Rock so small it packs into a mud slab.',
        'The pad at the wrong station, with the real exit a hundred feet away.',
        'Washing the exit with a hose toward the inlet.',
        'No sweeping, and a claim that the rock "should have been enough."'
      ],
      confirm: 'Thickness, rock size, width, and length are on the current EC(3)-16 sheet and Item 506. Check those before you put a dimension in the general notes. The one-acre expectation is from the TxDOT fact sheet this tool was written against. Confirm it.',
      svg: fig('Rock exit pad between a bare haul road and a paved street',
        '<rect x="16" y="36" width="130" height="100" fill="currentColor" opacity=".08" stroke="currentColor"/>' +
        '<rect x="146" y="56" width="70" height="60" fill="currentColor" opacity=".22" stroke="currentColor"/>' +
        '<rect x="216" y="36" width="88" height="100" fill="currentColor" opacity=".05" stroke="currentColor"/>' +
        '<circle cx="164" cy="78" r="5" fill="none" stroke="currentColor"/><circle cx="180" cy="90" r="5" fill="none" stroke="currentColor"/><circle cx="196" cy="74" r="5" fill="none" stroke="currentColor"/>' +
        '<text x="28" y="28" fill="currentColor" font-size="13" font-family="system-ui,sans-serif">Haul road</text>' +
        '<text x="152" y="48" fill="currentColor" font-size="13" font-family="system-ui,sans-serif">Rock</text>' +
        '<text x="224" y="28" fill="currentColor" font-size="13" font-family="system-ui,sans-serif">Pavement</text>' +
        '<text x="28" y="156" fill="currentColor" font-size="13" font-family="system-ui,sans-serif">Long enough for the tires</text>')
    },
    {
      id: 'street-sweeping', cat: 'road', name: 'Street sweeping', sheet: 'Street sweeping job aid',
      one: 'Picks up the mud the exit did not catch.',
      what: 'A broom or vacuum on the paved road at the exit and anywhere else mud shows up. It is the second half of tracking control. The TxDOT job aid used here says to sweep at the end of the day and during the work. Confirm the frequency on the current job aid and in the plans.',
      where: [
        'The public road at each construction exit, and paved areas inside the job that drain to inlets.',
        'Wherever you can see sediment or rock on the pavement. If you can see it, it is already on its way to the inlet.'
      ],
      install: [
        'There is nothing to build. Put sweeping on the SWP3 and say who does it.',
        'Limit the number of exits so one sweeper can keep up.',
        'Do not wash the gutter to "sweep." That is a discharge.'
      ],
      maintain: [
        'Sweep before the mud is ground into a paste, and again before a forecast rain if the road is dirty.',
        'Dispose of the sweepings with the other sediment, not in the ditch.',
        'If you are sweeping the same spot all day, the exit has failed. Fix the pad, do not only add sweepers.'
      ],
      mistakes: [
        'A note that says "sweep as needed" and a road that is brown every evening.',
        'Sweeping into the inlet instead of picking the material up.',
        'Washing the turn lane with a water truck.',
        'Ignoring the opposite gutter, where trucks tracked mud on the way out.'
      ],
      confirm: 'How often to sweep is a plan and job-aid question. Check the current TxDOT street-sweeping job aid. Do not treat a rock exit as a reason to skip the road.',
      svg: fig('Sweeper on a paved road collecting mud tracked past the construction exit',
        '<rect x="16" y="40" width="288" height="88" fill="currentColor" opacity=".06" stroke="currentColor"/>' +
        '<path d="M16 84 H304" stroke="currentColor" stroke-width="2" stroke-dasharray="8 6" opacity=".5"/>' +
        '<rect x="150" y="58" width="70" height="28" rx="4" fill="currentColor" opacity=".2" stroke="currentColor"/>' +
        '<circle cx="166" cy="92" r="8" fill="none" stroke="currentColor"/><circle cx="204" cy="92" r="8" fill="none" stroke="currentColor"/>' +
        '<path d="M40 100 h70" stroke="currentColor" stroke-width="4" opacity=".35"/>' +
        '<text x="20" y="32" fill="currentColor" font-size="14" font-family="system-ui,sans-serif">Tracked mud</text>' +
        '<text x="150" y="148" fill="currentColor" font-size="13" font-family="system-ui,sans-serif">Pick it up. Do not wash it.</text>')
    }
  ];

  function byId(id) {
    for (var i = 0; i < MEASURES.length; i++) if (MEASURES[i].id === id) return MEASURES[i];
    return null;
  }
  function inCat(cat) {
    return MEASURES.filter(function (m) { return m.cat === cat; });
  }
  var api = { CATS: CATS, MEASURES: MEASURES, byId: byId, inCat: inCat };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SwpGuide = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
