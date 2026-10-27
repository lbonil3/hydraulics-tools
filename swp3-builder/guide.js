/* Plain-language guide to erosion and sediment controls used on Texas / TxDOT jobs.
   Sketches are schematic. Numbers that depend on a standard say to check the current sheet. */
(function (root) {
  'use strict';
  function n(v) { return Math.round(v * 10) / 10; }
  function tx(x, y, s, size) {
    return '<text x="' + x + '" y="' + y + '" fill="currentColor" font-size="' + (size || 13) + '" font-family="system-ui,sans-serif">' + s + '</text>';
  }
  function arrow(x1, y1, x2, y2) {
    var dx = x2 - x1, dy = y2 - y1, len = Math.sqrt(dx * dx + dy * dy) || 1;
    var ux = dx / len, uy = dy / len, px = -uy, py = ux;
    var bx = x2 - ux * 11, by = y2 - uy * 11;
    return '<path d="M' + n(x1) + ' ' + n(y1) + ' L' + n(x2) + ' ' + n(y2) + '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
      '<path d="M' + n(x2) + ' ' + n(y2) + ' L' + n(bx + px * 5.5) + ' ' + n(by + py * 5.5) + ' L' + n(bx - px * 5.5) + ' ' + n(by - py * 5.5) + ' Z" fill="currentColor"/>';
  }
  function frame(x, y, w, h, title) {
    return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="8" fill="currentColor" fill-opacity=".04" stroke="currentColor" stroke-opacity=".45"/>' +
      tx(x + 12, y + 22, title, 15);
  }
  /* Two labeled views. Drawing coords are in the full 400 by 536 canvas. */
  function duo(label, topTitle, top, botTitle, bot) {
    return '<svg viewBox="0 0 400 536" role="img" aria-label="' + label + '">' +
      frame(8, 8, 384, 252, topTitle) + top + frame(8, 276, 384, 252, botTitle) + bot + '</svg>';
  }
  var CATS = [
    { id: 'hold', title: 'Hold mud before it leaves', blurb: 'Sheet flow at the downhill edge, at inlets, and beside creeks.' },
    { id: 'ditch', title: 'Slow water in a ditch', blurb: 'Rock checks, traps, and basins for concentrated flow.' },
    { id: 'cover', title: 'Cover bare soil', blurb: 'Seed, mulch, blankets, and tracking so rain does not pick soil up.' },
    { id: 'move', title: 'Move water without a washout', blurb: 'Dikes, pipes, and rock at the pipe end.' },
    { id: 'water', title: 'Work in the water', blurb: 'Curtains and crossings where the ground is already wet.' },
    { id: 'road', title: 'Keep mud off the pavement', blurb: 'The exit, the street in front of it, and the washout.' }
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
        'The trench is on the uphill side. Bury the bottom of the fabric in it and tamp the soil so water cannot run under.',
        'Posts stand on the downhill side of the fabric, so the load of the ponded water pulls the fabric against the posts.',
        'Turn the ends uphill (a J-hook) so water cannot go around them.',
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
      svg: duo('Silt fence section and plan. Fabric is trenched on the upslope side, posts stand on the downslope side, water ponds upslope, and the ends turn upslope.',
        'Section',
        '<path d="M24 78 L150 168 L150 246 L24 246 Z" fill="currentColor" fill-opacity=".08"/>' +
        '<path d="M150 168 L372 196 L372 246 L150 246 Z" fill="currentColor" fill-opacity=".05"/>' +
        '<path d="M24 78 L168 176" fill="none" stroke="currentColor" stroke-width="2"/>' +
        '<path d="M228 188 L372 196" fill="none" stroke="currentColor" stroke-width="2"/>' +
        '<path d="M156 170 L156 214 L196 220 L210 176 Z" fill="currentColor" fill-opacity=".16" stroke="currentColor" stroke-width="1.5"/>' +
        '<path d="M164 210 L186 172 L200 108" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/>' +
        '<line x1="214" y1="112" x2="220" y2="186" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>' +
        '<line x1="236" y1="116" x2="242" y2="190" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>' +
        '<path d="M70 150 L186 172 L164 210 L96 168 Z" fill="currentColor" fill-opacity=".22"/>' +
        arrow(40, 112, 130, 152) +
        tx(28, 58, 'Upslope') + tx(28, 128, 'Flow') + tx(148, 240, 'Trench') + tx(248, 108, 'Posts') + tx(260, 230, 'Downslope'),
        'Plan',
        '<path d="M70 470 L70 400 L130 400" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/>' +
        '<path d="M330 470 L330 400 L270 400" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/>' +
        '<line x1="70" y1="470" x2="330" y2="470" stroke="currentColor" stroke-width="4"/>' +
        '<path d="M130 458 L270 458" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="4 3"/>' +
        '<line x1="160" y1="470" x2="160" y2="488" stroke="currentColor" stroke-width="3"/>' +
        '<line x1="210" y1="470" x2="210" y2="488" stroke="currentColor" stroke-width="3"/>' +
        '<line x1="260" y1="470" x2="260" y2="488" stroke="currentColor" stroke-width="3"/>' +
        '<path d="M130 430 L270 430 L270 468 L130 468 Z" fill="currentColor" fill-opacity=".16"/>' +
        arrow(150, 330, 150, 410) + arrow(210, 330, 210, 410) + arrow(270, 330, 270, 410) +
        tx(24, 318, 'Upslope') + tx(24, 360, 'Flow') + tx(136, 424, 'Ponding') + tx(24, 508, 'Ends turn upslope') + tx(200, 492, 'Posts downhill'))
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
        'Set the log in a shallow trench so water cannot get under it. Stakes go on the downhill side. Seams face the way the sheet shows.',
        'On a slope, lay the log on the contour and turn the ends upslope.',
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
      svg: duo('Erosion control log. Section shows the log in a shallow trench with stakes on the downhill side and ponding upslope. Plan shows the log on the contour with ends turned upslope.',
        'Section',
        '<path d="M24 90 L200 180 L372 200 L372 246 L24 246 Z" fill="currentColor" fill-opacity=".07"/>' +
        '<path d="M24 90 L372 200" fill="none" stroke="currentColor" stroke-width="2"/>' +
        '<path d="M150 168 L168 198 L230 206 L214 170 Z" fill="currentColor" fill-opacity=".12" stroke="currentColor"/>' +
        '<ellipse cx="196" cy="168" rx="46" ry="16" fill="currentColor" fill-opacity=".2" stroke="currentColor" stroke-width="2"/>' +
        '<path d="M160 168 q16 -8 32 0 q16 8 32 0" fill="none" stroke="currentColor" stroke-width="1.5"/>' +
        '<line x1="176" y1="156" x2="168" y2="206" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>' +
        '<line x1="220" y1="160" x2="212" y2="210" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>' +
        '<path d="M60 140 L160 164 L150 186 L80 156 Z" fill="currentColor" fill-opacity=".22"/>' +
        arrow(36, 118, 120, 150) +
        tx(24, 58, 'Upslope') + tx(24, 112, 'Flow') + tx(250, 150, 'Log') + tx(236, 230, 'Stakes downhill'),
        'Plan',
        '<path d="M80 470 L80 410 L130 410" fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" stroke-opacity=".85"/>' +
        '<path d="M320 470 L320 410 L270 410" fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" stroke-opacity=".85"/>' +
        '<line x1="80" y1="470" x2="320" y2="470" stroke="currentColor" stroke-width="10" stroke-linecap="round"/>' +
        '<line x1="140" y1="470" x2="132" y2="494" stroke="currentColor" stroke-width="2"/>' +
        '<line x1="210" y1="470" x2="202" y2="494" stroke="currentColor" stroke-width="2"/>' +
        '<line x1="280" y1="470" x2="272" y2="494" stroke="currentColor" stroke-width="2"/>' +
        arrow(160, 330, 160, 430) + arrow(240, 330, 240, 430) +
        tx(24, 318, 'Along the contour') + tx(24, 516, 'Ends turned upslope'))
    },
    {
      id: 'sandbag-berm', cat: 'hold', name: 'Sandbag berm', sheet: 'EC sheets for sandbags',
      one: 'A low wall of bags where you cannot trench a silt fence.',
      what: 'Sandbags stacked into a short berm. They pond sheet flow the way a silt fence does, and they sit on pavement, rock, or frozen ground where you cannot dig a trench. They are also a curb-inlet tool and a short temporary diversion. They are not a rock filter dam, and they are not a dam for a fast ditch.',
      where: [
        'Along the downhill edge of a stockpile or a paved work area, on the contour.',
        'In front of a curb inlet, with a gap or a low point so the street can still drain.',
        'As a short diversion of sheet flow toward a trap. Not across a channel that will concentrate a storm.'
      ],
      install: [
        'Butt the bags tight, and stagger the joints if you stack more than one course. Water finds a crack between bags.',
        'Turn the ends upslope so the pond cannot walk around the berm.',
        'Keep the berm low. A tall stack in the clear zone or in a gutter becomes a hazard and a dam.',
        'The current TxDOT sheet for the sandbag detail you are using has the bag size, the stack, and where bags are allowed. Check that sheet. Do not copy a count from another job.'
      ],
      maintain: [
        'Replace a bag that has split or gone soft, and restack any that a tire has kicked out.',
        'Remove trapped soil before the berm is buried. A buried bag is just a lump of sand in the mud.',
        'Take the bags out when the area is stable. Abandoned bags in a gutter hold water on a finished road.'
      ],
      mistakes: [
        'One loose row with gaps, so the water never ponds.',
        'A sandbag berm used as a check dam in a roadside ditch that needs rock.',
        'Bags sealing a curb inlet with no overflow.',
        'Ends left running downhill, so the water flanks the berm and cuts a rut.'
      ],
      confirm: 'Bag material, stack, and where a sandbag berm is the right tool are on the current TxDOT sheet. Check it before you call out a height.',
      svg: duo('Sandbag berm. Section shows bags stacked tight with ponding on the upslope side. Plan shows the berm on the contour with ends turned upslope.',
        'Section',
        '<path d="M24 200 L372 200 L372 246 L24 246 Z" fill="currentColor" fill-opacity=".07"/>' +
        '<path d="M24 200 L372 200" fill="none" stroke="currentColor" stroke-width="2"/>' +
        '<rect x="168" y="168" width="36" height="32" rx="3" fill="currentColor" fill-opacity=".16" stroke="currentColor" stroke-width="1.5"/>' +
        '<rect x="150" y="136" width="36" height="32" rx="3" fill="currentColor" fill-opacity=".16" stroke="currentColor" stroke-width="1.5"/>' +
        '<rect x="186" y="136" width="36" height="32" rx="3" fill="currentColor" fill-opacity=".16" stroke="currentColor" stroke-width="1.5"/>' +
        '<path d="M40 176 L150 176 L168 200 L40 200 Z" fill="currentColor" fill-opacity=".2"/>' +
        arrow(48, 120, 130, 160) +
        tx(24, 58, 'Upslope') + tx(24, 108, 'Sheet flow') + tx(150, 118, 'Stagger the joints') + tx(24, 236, 'Tight to the ground'),
        'Plan',
        '<path d="M90 470 L90 400 L140 400" fill="none" stroke="currentColor" stroke-width="14" stroke-linecap="butt" stroke-linejoin="round" stroke-opacity=".7"/>' +
        '<path d="M310 470 L310 400 L260 400" fill="none" stroke="currentColor" stroke-width="14" stroke-linecap="butt" stroke-linejoin="round" stroke-opacity=".7"/>' +
        '<line x1="90" y1="470" x2="310" y2="470" stroke="currentColor" stroke-width="14" stroke-linecap="butt" stroke-opacity=".7"/>' +
        arrow(170, 330, 170, 430) + arrow(240, 330, 240, 430) +
        tx(24, 318, 'On the contour') + tx(24, 516, 'Ends turned upslope'))
    },
    {
      id: 'rock-berm', cat: 'hold', name: 'Rock berm', sheet: 'EC sheet for rock berms',
      one: 'A low rock wedge for sheet flow, not a dam in a ditch.',
      what: 'A wedge of rock along the contour that slows sheet flow and drops sediment. It is the sheet-flow cousin of a rock filter dam. A rock filter dam crosses a ditch and has a low center so the ditch flow goes over the middle. A rock berm does not. Do not put this berm across a channel.',
      where: [
        'At the toe of a slope and along the downhill edge of disturbed ground, where the flow is still spread out.',
        'Where rock will stay put and a silt fence is a poor fit, such as on rock or where equipment will work close to the line.',
        'Not in a roadside ditch, a stream, or any place the water has already gathered into a channel. Use a rock filter dam or a trap there.'
      ],
      install: [
        'Lay the berm on the contour and turn the ends upslope.',
        'Key the rock into the ground or seat it on fabric if the current sheet shows bedding, so water does not pipe underneath.',
        'The upstream face ponds the water. The downstream face is the side that must not unravel. The sheet gives the rock and the slopes. Check it.',
        'Do not leave a low gap at one end. That gap becomes the channel you were trying not to build.'
      ],
      maintain: [
        'Replace rock that has rolled out, and shovel sediment out of the upstream pool before the berm is buried.',
        'If a rill is cutting around an end, the berm is no longer on the contour. Rebuild the return upslope.'
      ],
      mistakes: [
        'Using a rock berm as a check dam in a ditch, with no weir and no tie into the banks.',
        'Rock so small that sheet flow carries it away.',
        'A berm running downhill, which collects water and then releases it at the low end.',
        'Calling a rock berm a rock filter dam on the summary sheet. They are different details.'
      ],
      confirm: 'Rock size, height, and whether fabric goes under the berm are on the current TxDOT rock-berm sheet. Check that sheet. This page does not pick a gradation.',
      svg: duo('Rock berm for sheet flow. Section shows a rock wedge with ponding on the upstream face. Plan shows the berm on the contour, not across a ditch.',
        'Section',
        '<path d="M24 196 L372 196 L372 246 L24 246 Z" fill="currentColor" fill-opacity=".07"/>' +
        '<path d="M24 196 L372 196" fill="none" stroke="currentColor" stroke-width="2"/>' +
        '<path d="M150 196 L190 140 L250 196 Z" fill="currentColor" fill-opacity=".16" stroke="currentColor" stroke-width="1.5"/>' +
        '<circle cx="176" cy="180" r="7" fill="none" stroke="currentColor"/><circle cx="198" cy="168" r="8" fill="none" stroke="currentColor"/><circle cx="220" cy="178" r="7" fill="none" stroke="currentColor"/>' +
        '<path d="M40 176 L160 176 L150 196 L40 196 Z" fill="currentColor" fill-opacity=".2"/>' +
        arrow(48, 120, 130, 160) +
        tx(24, 58, 'Sheet flow') + tx(256, 150, 'Rock') + tx(150, 132, 'Upstream face') + tx(24, 232, 'Not a ditch'),
        'Plan',
        '<path d="M80 468 L80 410 L140 410" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round" stroke-opacity=".55"/>' +
        '<path d="M320 468 L320 410 L260 410" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round" stroke-opacity=".55"/>' +
        '<line x1="80" y1="468" x2="320" y2="468" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-opacity=".55"/>' +
        arrow(170, 328, 170, 430) + arrow(240, 328, 240, 430) +
        tx(24, 318, 'On the contour') + tx(24, 516, 'Ends upslope. No channel.'))
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
      svg: duo('Inlet protection. Curb inlet section shows bags below the opening so water can still overflow into the inlet. Area inlet plan shows a ring with ends turned upslope and the grate left open.',
        'Curb inlet, section',
        '<path d="M24 150 L250 150 L250 210 L300 210 L300 246 L24 246 Z" fill="currentColor" fill-opacity=".06" stroke="currentColor"/>' +
        '<path d="M250 150 L300 150 L300 190 L250 190 Z" fill="none" stroke="currentColor" stroke-width="2"/>' +
        '<path d="M258 158 h34 M258 170 h34 M258 182 h34" stroke="currentColor" stroke-width="1.5"/>' +
        '<rect x="150" y="124" width="40" height="26" rx="3" fill="currentColor" fill-opacity=".2" stroke="currentColor"/>' +
        '<rect x="176" y="150" width="40" height="26" rx="3" fill="currentColor" fill-opacity=".2" stroke="currentColor"/>' +
        '<path d="M40 140 L150 140 L176 176 L40 176 Z" fill="currentColor" fill-opacity=".16"/>' +
        arrow(40, 100, 140, 128) + arrow(200, 100, 270, 148) +
        tx(24, 58, 'Gutter') + tx(24, 92, 'Flow') + tx(150, 116, 'Bags') + tx(300, 140, 'Overflow') + tx(300, 168, 'Opening'),
        'Area inlet, plan',
        '<rect x="168" y="390" width="64" height="64" fill="none" stroke="currentColor" stroke-width="2"/>' +
        '<path d="M178 404 h44 M178 418 h44 M178 432 h44" stroke="currentColor"/>' +
        '<path d="M140 430 L110 360 L160 360" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/>' +
        '<path d="M260 430 L290 360 L240 360" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/>' +
        '<path d="M140 430 L140 490 L260 490 L260 430" fill="none" stroke="currentColor" stroke-width="3"/>' +
        arrow(70, 330, 130, 380) + arrow(330, 330, 270, 380) +
        tx(24, 318, 'Flow from upslope') + tx(24, 470, 'Fence or bags') + tx(24, 516, 'Ends turn upslope'))
    },
    {
      id: 'vegetated-buffer', cat: 'hold', name: 'Vegetated buffer', sheet: 'Summary sheet 2.6',
      one: 'A vegetated filter strip of existing grass between the work and the water.',
      what: 'A band of plants left in place, also called a vegetated filter strip, so sheet flow crosses grass before it reaches a creek, pond, or wetland. The grass slows the water and catches soil. It is not a ditch liner, and a rill cut through it is no longer a buffer.',
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
      svg: duo('Vegetated filter strip. Section shows shallow sheet flow over grass, not a channel. Plan shows several small arrows across the strip and a rill marked as the wrong pattern.',
        'Section',
        '<path d="M24 150 L140 170 L230 160 L300 186 L372 186 L372 246 L24 246 Z" fill="currentColor" fill-opacity=".08" stroke="currentColor"/>' +
        '<path d="M140 170 L230 160 L230 246 L140 246 Z" fill="currentColor" fill-opacity=".16"/>' +
        '<path d="M300 186 L372 186 L372 246 L300 246 Z" fill="currentColor" fill-opacity=".28"/>' +
        '<path d="M150 150 q8 10 0 18 M170 146 q8 10 0 18 M190 148 q8 10 0 18 M210 144 q8 10 0 18" fill="none" stroke="currentColor" stroke-width="1.5"/>' +
        arrow(40, 120, 120, 155) + arrow(160, 110, 200, 145) +
        tx(28, 70, 'Bare work') + tx(150, 64, 'Grass') + tx(304, 70, 'Creek') + tx(24, 236, 'Sheet flow, shallow'),
        'Plan',
        '<rect x="24" y="360" width="110" height="140" fill="currentColor" fill-opacity=".06" stroke="currentColor"/>' +
        '<rect x="134" y="360" width="90" height="140" fill="currentColor" fill-opacity=".16" stroke="currentColor"/>' +
        '<rect x="224" y="360" width="140" height="140" fill="currentColor" fill-opacity=".24" stroke="currentColor"/>' +
        '<line x1="134" y1="400" x2="224" y2="400" stroke="currentColor" stroke-width="2"/>' +
        arrow(50, 390, 120, 390) + arrow(50, 430, 120, 430) + arrow(50, 470, 120, 470) +
        '<path d="M70 410 L150 450 L200 420" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="4 3"/>' +
        '<path d="M188 408 l16 8 M188 424 l16 -8" fill="none" stroke="currentColor" stroke-width="2"/>' +
        tx(36, 348, 'Work') + tx(150, 348, 'Strip') + tx(250, 348, 'Water') + tx(24, 516, 'Level entry. No rill.'))
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
        'Make the center lower than the ends, a weir, so overflow goes over the middle and not around a bank. Key the rock into the bed as well as the banks.',
        'Space dams so the toe of an upstream dam sits at about the same elevation as the crest of the next dam downstream. Spacing depends on height and ditch slope. See the check-dam page and EC(2)-16.'
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
      svg: duo('Rock filter dam. Section through the weir shows the upstream pool, rock keyed into the bed, and a longer downstream face. Plan shows the low center and the ends keyed into the banks.',
        'Section through the weir',
        '<path d="M24 190 L372 190" fill="none" stroke="currentColor" stroke-width="2"/>' +
        '<path d="M24 190 L372 190 L372 246 L24 246 Z" fill="currentColor" fill-opacity=".06"/>' +
        '<path d="M150 190 L168 210 L250 210 L300 190 Z" fill="currentColor" fill-opacity=".1" stroke="currentColor" stroke-dasharray="3 2"/>' +
        '<path d="M160 190 L200 130 L250 150 L310 190 Z" fill="currentColor" fill-opacity=".2" stroke="currentColor" stroke-width="1.5"/>' +
        '<circle cx="190" cy="168" r="7" fill="none" stroke="currentColor"/><circle cx="214" cy="156" r="8" fill="none" stroke="currentColor"/><circle cx="240" cy="164" r="7" fill="none" stroke="currentColor"/><circle cx="268" cy="172" r="7" fill="none" stroke="currentColor"/>' +
        '<path d="M36 150 L200 130 L180 190 L36 190 Z" fill="currentColor" fill-opacity=".18"/>' +
        arrow(40, 110, 150, 140) + arrow(210, 118, 280, 140) +
        tx(24, 58, 'Upstream pool') + tx(200, 112, 'Weir crest') + tx(300, 120, 'Downstream') + tx(150, 232, 'Keyed into the bed'),
        'Plan',
        '<path d="M40 340 L80 400 L80 480 L40 500" fill="none" stroke="currentColor" stroke-width="2"/>' +
        '<path d="M360 340 L320 400 L320 480 L360 500" fill="none" stroke="currentColor" stroke-width="2"/>' +
        '<path d="M80 430 L140 400 L200 450 L260 400 L320 430 L300 470 L100 470 Z" fill="currentColor" fill-opacity=".18" stroke="currentColor"/>' +
        '<path d="M175 360 L200 450 L225 360" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="4 3"/>' +
        arrow(180, 320, 200, 360) +
        tx(24, 318, 'Flow') + tx(168, 500, 'Low center, the weir') + tx(24, 516, 'Ends keyed into the banks'))
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
        'Spacing follows the ditch slope and the dam height. Set them so the toe of the upstream dam is at about the same elevation as the crest of the downstream dam. Standing water then reaches from one crest back to the next dam. A steep ditch needs them closer. EC(2)-16 and EC(9)-16 show the rule for the device you chose.',
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
      svg: duo('Check dams. The profile shows the toe of the upstream dam at the same elevation as the crest of the next dam downstream. The plan shows the center lower than the ends.',
        'Profile',
        '<path d="M28 74 L360 246" fill="none" stroke="currentColor" stroke-width="2"/>' +
        '<path d="M64 108 L96 72 L132 128 Z" fill="currentColor" fill-opacity=".22" stroke="currentColor"/>' +
        '<path d="M168 164 L206 128 L244 186 Z" fill="currentColor" fill-opacity=".22" stroke="currentColor"/>' +
        '<path d="M270 214 L308 186 L346 236 Z" fill="currentColor" fill-opacity=".22" stroke="currentColor"/>' +
        '<path d="M132 128 L206 128" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="5 3"/>' +
        '<path d="M244 186 L308 186" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="5 3"/>' +
        tx(24, 56, 'Upstream') + tx(300, 160, 'Downstream') + tx(136, 118, 'Same elevation') + tx(24, 246, 'Toe of upper dam, crest of next'),
        'One dam, plan',
        '<path d="M70 340 L110 390 L110 470 L70 500" fill="none" stroke="currentColor" stroke-width="2"/>' +
        '<path d="M330 340 L290 390 L290 470 L330 500" fill="none" stroke="currentColor" stroke-width="2"/>' +
        '<path d="M110 430 L150 390 L200 455 L250 390 L290 430 L270 470 L130 470 Z" fill="currentColor" fill-opacity=".2" stroke="currentColor"/>' +
        arrow(186, 320, 200, 370) +
        tx(24, 318, 'Flow') + tx(160, 500, 'Center lower than the banks') + tx(24, 516, 'Overflow stays in the ditch'))
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
      svg: duo('Sediment trap. Section shows an excavated pool and a rock outlet with the water leaving over the rock. Plan shows the ditch entering the wide pool and the rock at the downstream end.',
        'Section',
        '<path d="M24 150 L90 150 L120 210 L230 210 L270 150 L300 120 L340 170 L372 170 L372 246 L24 246 Z" fill="currentColor" fill-opacity=".08" stroke="currentColor"/>' +
        '<path d="M230 210 L270 150 L330 150 L300 210 Z" fill="currentColor" fill-opacity=".22" stroke="currentColor"/>' +
        '<circle cx="268" cy="176" r="6" fill="none" stroke="currentColor"/><circle cx="290" cy="168" r="7" fill="none" stroke="currentColor"/><circle cx="312" cy="178" r="6" fill="none" stroke="currentColor"/>' +
        '<path d="M100 176 L250 176" fill="none" stroke="currentColor" stroke-width="3" stroke-opacity=".45"/>' +
        arrow(36, 110, 80, 140) + arrow(280, 130, 340, 145) +
        tx(24, 58, 'Ditch in') + tx(250, 108, 'Rock weir') + tx(110, 200, 'Shallow pool') + tx(24, 236, 'Wide, not a deep hole'),
        'Plan',
        '<path d="M40 400 L120 360 L120 480 L40 440 Z" fill="none" stroke="currentColor" stroke-width="2"/>' +
        '<path d="M120 360 L250 330 L300 400 L250 470 L120 480 Z" fill="currentColor" fill-opacity=".1" stroke="currentColor"/>' +
        '<path d="M250 340 L310 400 L250 460 L270 400 Z" fill="currentColor" fill-opacity=".22" stroke="currentColor"/>' +
        arrow(50, 400, 110, 400) + arrow(300, 390, 350, 390) +
        tx(24, 318, 'In') + tx(200, 500, 'Pool') + tx(250, 516, 'Rock out'))
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
        'The permit wants an outlet that draws water from the surface when that is feasible, so the mud at the bottom stays in the basin. A skimmer or a riser with the openings near the surface does that. A pipe at the bottom does not.',
        'Baffles across the short direction make the water travel the long way. Without them, inflow short-circuits to the outlet and the rest of the pool is dead storage.',
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
      svg: duo('Sediment basin. Section shows a surface skimmer, sediment on the bottom, and an emergency spillway in the embankment. Plan shows inflow opposite the outlet, with baffles forcing a long path.',
        'Section',
        '<path d="M24 150 L70 150 L110 220 L250 220 L300 130 L340 150 L372 170 L372 246 L24 246 Z" fill="currentColor" fill-opacity=".08" stroke="currentColor"/>' +
        '<path d="M90 186 L270 186" fill="none" stroke="currentColor" stroke-width="3" stroke-opacity=".4"/>' +
        '<path d="M110 210 L250 210 L240 230 L120 230 Z" fill="currentColor" fill-opacity=".2"/>' +
        '<path d="M200 150 L214 150 L214 186" fill="none" stroke="currentColor" stroke-width="2"/>' +
        '<ellipse cx="196" cy="186" rx="16" ry="7" fill="none" stroke="currentColor" stroke-width="2"/>' +
        '<path d="M300 130 L340 130 L348 160 L308 155 Z" fill="none" stroke="currentColor" stroke-width="2"/>' +
        arrow(36, 110, 80, 140) +
        tx(24, 58, 'Muddy in') + tx(150, 140, 'Skimmer') + tx(300, 112, 'Spillway') + tx(130, 242, 'Soil on the bottom'),
        'Plan',
        '<path d="M40 360 L70 340 L300 340 L340 390 L300 500 L70 500 L40 460 Z" fill="currentColor" fill-opacity=".08" stroke="currentColor"/>' +
        '<path d="M110 360 L150 400 L110 440" fill="none" stroke="currentColor" stroke-width="2"/>' +
        '<path d="M250 420 L210 460 L250 500" fill="none" stroke="currentColor" stroke-width="2"/>' +
        '<circle cx="300" cy="420" r="8" fill="none" stroke="currentColor" stroke-width="2"/>' +
        '<path d="M330 360 L360 390 L340 400" fill="none" stroke="currentColor" stroke-width="2"/>' +
        arrow(24, 400, 55, 400) +
        tx(24, 318, 'Inflow') + tx(120, 390, 'Baffle') + tx(200, 470, 'Baffle') + tx(250, 400, 'Outlet') + tx(300, 348, 'Spillway'))
    },
    {
      id: 'seeding-mulch', cat: 'cover', name: 'Seeding, mulch, and sod', sheet: 'Items 162, 164, and 169 notes',
      one: 'Cover bare soil with seed and mulch, or with sod where the cover has to be there now.',
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
      svg: duo('Seeding and sod. Section shows mulch over seed on a slope, with the bare slope beside it. Plan shows sod strips laid across the slope with staggered joints.',
        'Section',
        '<path d="M24 200 L170 90 L170 246 L24 246 Z" fill="currentColor" fill-opacity=".06" stroke="currentColor"/>' +
        '<path d="M190 246 L190 90 L340 200 L340 246 Z" fill="currentColor" fill-opacity=".12" stroke="currentColor"/>' +
        '<path d="M210 180 q10 -16 20 0 M240 160 q10 -18 20 0 M270 175 q10 -14 20 0" fill="none" stroke="currentColor" stroke-width="1.5"/>' +
        '<path d="M200 120 L330 190" fill="none" stroke="currentColor" stroke-width="6" stroke-opacity=".25"/>' +
        tx(40, 180, 'Bare') + tx(210, 230, 'Seed and mulch') + tx(24, 70, 'Cover the same day'),
        'Sod, plan',
        '<path d="M40 340 L300 470 L360 470 L100 340 Z" fill="currentColor" fill-opacity=".06" stroke="currentColor"/>' +
        '<path d="M70 360 h200 M90 390 h200 M110 420 h200 M130 450 h190" fill="none" stroke="currentColor" stroke-width="8" stroke-opacity=".35" stroke-linecap="butt"/>' +
        '<path d="M70 360 h90 M180 390 h90 M110 420 h80 M210 450 h90" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="3 3"/>' +
        arrow(300, 330, 340, 400) +
        tx(24, 318, 'Strips across the slope') + tx(24, 516, 'Joints staggered. Downslope to the right'))
    },
    {
      id: 'blanket', cat: 'cover', name: 'Soil retention blanket', sheet: 'Item 169',
      one: 'An erosion control blanket pinned over soil or seed on a slope or in a ditch.',
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
      svg: duo('Soil retention blanket. Section shows the top buried in a trench, shingle overlaps running downhill, and staples. Plan shows the same overlap direction.',
        'Section',
        '<path d="M40 70 L300 210 L40 230 Z" fill="currentColor" fill-opacity=".07" stroke="currentColor"/>' +
        '<path d="M70 88 L70 118 L110 108 L100 86 Z" fill="currentColor" fill-opacity=".12" stroke="currentColor"/>' +
        '<path d="M96 104 L200 168" fill="none" stroke="currentColor" stroke-width="7" stroke-opacity=".35" stroke-linecap="round"/>' +
        '<path d="M150 130 L250 190" fill="none" stroke="currentColor" stroke-width="7" stroke-opacity=".45" stroke-linecap="round"/>' +
        '<circle cx="130" cy="128" r="3" fill="currentColor"/><circle cx="170" cy="152" r="3" fill="currentColor"/><circle cx="210" cy="176" r="3" fill="currentColor"/>' +
        arrow(250, 100, 300, 150) +
        tx(120, 64, 'Top trench') + tx(200, 120, 'Upper over lower') + tx(24, 246, 'Staples. Downhill to the right'),
        'Plan',
        '<path d="M40 340 L320 500 L40 500 Z" fill="currentColor" fill-opacity=".05" stroke="currentColor"/>' +
        '<path d="M70 360 L70 400 L130 390 L120 355 Z" fill="none" stroke="currentColor" stroke-width="1.5"/>' +
        '<path d="M90 390 L200 470" fill="none" stroke="currentColor" stroke-width="10" stroke-opacity=".25"/>' +
        '<path d="M150 410 L250 490" fill="none" stroke="currentColor" stroke-width="10" stroke-opacity=".35"/>' +
        arrow(240, 340, 300, 420) +
        tx(140, 330, 'Overlap faces downhill') + tx(24, 516, 'Check the staple pattern'))
    },
    {
      id: 'vertical-tracking', cat: 'cover', name: 'Vertical tracking', sheet: 'EC(1)-16',
      one: 'Grooves across a slope, made by driving up and down, so water does not run straight down.',
      what: 'Grooves pressed across the slope, parallel to the contour. A tracked machine makes those grooves by driving up and down the hill, because the cleats run across the direction of travel. Grooves that run downhill become rills. TxDOT Item 506 calls for vertical tracking on slopes where soil is being disturbed, unless the engineer approves something else. It is temporary. It is not a substitute for seed, fence, or a blanket.',
      where: [
        'The face of a slope you just graded and have not covered yet.',
        'Show on the plans where it is required. It is hard to enforce if it is only a general note.'
      ],
      install: [
        'Drive up and down the slope so the grooves run across it. Driving along the contour leaves grooves that point downhill.',
        'Item 506 describes the length, width, depth, and spacing of the grooves. Check the current item for those numbers. Do not compact the slope into a hard crust. A few passes are enough.',
        'Track as you go. Tracking a slope weeks later, after it has already rilled, does not put the soil back.'
      ],
      maintain: [
        'Re-track after a hard rain if the grooves have washed out, and get seed or a blanket on the slope if tracking will not hold it.',
        'Do not use tracking alone next to a creek if the slope is already failing.'
      ],
      mistakes: [
        'Driving along the contour, or any pattern that leaves downhill grooves. Those grooves become ditches.',
        'So many passes that the soil is glazed and seed cannot take.',
        'Skipping it on a short slope because it "does not look steep." The specification is about disturbed slopes, not a picture in your head.',
        'Leaving tracked soil bare through a whole rainy month.'
      ],
      confirm: 'Groove size and where tracking is mandatory are in the current Item 506 and on EC(1)-16. Check those before you change the note.',
      svg: duo('Vertical tracking. Grooves run across the slope. The machine travels up and down to make them. Grooves that run downhill are the wrong pattern.',
        'Slope face',
        '<path d="M40 70 L300 210 L40 230 Z" fill="currentColor" fill-opacity=".07" stroke="currentColor"/>' +
        '<path d="M70 110 h150 M80 140 h150 M90 170 h140" fill="none" stroke="currentColor" stroke-width="3" stroke-opacity=".75"/>' +
        arrow(250, 90, 250, 180) + arrow(250, 190, 250, 110) +
        tx(70, 96, 'Grooves across the slope') + tx(200, 64, 'Drive up and down'),
        'Wrong pattern',
        '<path d="M80 340 L280 470 L80 500 Z" fill="currentColor" fill-opacity=".05" stroke="currentColor"/>' +
        '<path d="M120 360 L150 470 M160 350 L190 480 M200 355 L230 475" fill="none" stroke="currentColor" stroke-width="3" stroke-opacity=".7"/>' +
        '<path d="M250 360 L310 420 M310 360 L250 420" fill="none" stroke="currentColor" stroke-width="3"/>' +
        tx(24, 330, 'Grooves that run downhill') + tx(24, 516, 'These become rills'))
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
      svg: duo('Keep existing vegetation. Plan shows the fence outside the dripline and equipment outside the fence. Section shows no trench through the roots.',
        'Section',
        '<path d="M24 200 L372 200 L372 246 L24 246 Z" fill="currentColor" fill-opacity=".08"/>' +
        '<path d="M24 200 L372 200" fill="none" stroke="currentColor" stroke-width="2"/>' +
        '<path d="M180 200 L180 120" fill="none" stroke="currentColor" stroke-width="3"/>' +
        '<circle cx="180" cy="100" r="28" fill="none" stroke="currentColor" stroke-width="2"/>' +
        '<path d="M150 200 q-20 20 10 30 M210 200 q20 20 -10 30" fill="none" stroke="currentColor" stroke-width="1.5"/>' +
        '<line x1="70" y1="160" x2="70" y2="200" stroke="currentColor" stroke-width="2" stroke-dasharray="4 3"/>' +
        '<line x1="290" y1="160" x2="290" y2="200" stroke="currentColor" stroke-width="2" stroke-dasharray="4 3"/>' +
        '<rect x="24" y="168" width="36" height="20" fill="currentColor" fill-opacity=".25" stroke="currentColor"/>' +
        tx(24, 64, 'Fence outside the crown') + tx(210, 78, 'Do not trench the roots') + tx(24, 236, 'Equipment stays out'),
        'Plan',
        '<circle cx="200" cy="420" r="36" fill="none" stroke="currentColor" stroke-width="2"/>' +
        '<circle cx="200" cy="420" r="70" fill="none" stroke="currentColor" stroke-dasharray="2 3" stroke-opacity=".7"/>' +
        '<rect x="100" y="340" width="200" height="160" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="6 4"/>' +
        '<rect x="36" y="430" width="40" height="24" fill="currentColor" fill-opacity=".25" stroke="currentColor"/>' +
        tx(24, 318, 'Dripline') + tx(24, 516, 'Fence outside the dripline'))
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
      svg: duo('Stockpile. Section shows a cover that reaches the ground and a silt fence trenched on the downhill side. Plan shows the pile away from the ditch.',
        'Section',
        '<path d="M24 200 L372 210 L372 246 L24 246 Z" fill="currentColor" fill-opacity=".06"/>' +
        '<path d="M80 200 L160 110 L250 200 Z" fill="currentColor" fill-opacity=".14" stroke="currentColor"/>' +
        '<path d="M100 170 L160 120 L230 175 L240 200 L90 200 Z" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="5 3"/>' +
        '<path d="M268 204 L268 236 L292 240 L286 200 Z" fill="currentColor" fill-opacity=".14" stroke="currentColor"/>' +
        '<path d="M286 236 L286 150" fill="none" stroke="currentColor" stroke-width="3"/>' +
        '<path d="M40 186 L140 160" fill="none" stroke="currentColor" stroke-width="2"/>' +
        arrow(40, 140, 110, 165) +
        tx(24, 64, 'Downhill to the right') + tx(150, 100, 'Cover to the ground') + tx(300, 140, 'Fence') + tx(24, 236, 'Trench on the uphill face of the fence'),
        'Plan',
        '<path d="M40 470 L300 470 L330 500 L20 500 Z" fill="currentColor" fill-opacity=".1" stroke="currentColor"/>' +
        '<path d="M120 400 L180 340 L250 400 Z" fill="currentColor" fill-opacity=".14" stroke="currentColor"/>' +
        '<path d="M250 360 L250 430 L270 430 L270 370" fill="none" stroke="currentColor" stroke-width="3"/>' +
        tx(24, 330, 'Pile') + tx(24, 460, 'Fence downhill') + tx(200, 500, 'Ditch is the other way'))
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
      svg: duo('Diversion. Section shows a compacted dike with a swale on the uphill side. Plan shows the swale graded to a rock outlet, not off the end of a fill.',
        'Section',
        '<path d="M24 190 L120 190 L150 140 L190 140 L230 200 L372 210 L372 246 L24 246 Z" fill="currentColor" fill-opacity=".08" stroke="currentColor"/>' +
        '<path d="M90 175 L140 175 L150 190 L80 190 Z" fill="currentColor" fill-opacity=".18"/>' +
        arrow(40, 130, 100, 165) +
        tx(24, 64, 'Upslope water') + tx(150, 128, 'Compacted dike') + tx(70, 168, 'Swale') + tx(250, 190, 'Work below'),
        'Plan',
        '<path d="M40 360 L280 390 L340 470" fill="none" stroke="currentColor" stroke-width="8" stroke-opacity=".35" stroke-linecap="round"/>' +
        '<path d="M40 348 L280 378" fill="none" stroke="currentColor" stroke-width="2"/>' +
        '<circle cx="336" cy="478" r="12" fill="none" stroke="currentColor"/><circle cx="352" cy="492" r="8" fill="none" stroke="currentColor"/>' +
        arrow(80, 330, 160, 350) +
        tx(24, 318, 'Along the top of the slope') + tx(180, 516, 'Rock outlet, not a raw fill'))
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
      svg: duo('Pipe slope drain. Section shows a berm that forces water into the pipe, anchors down the face, and rock at the outlet. Plan shows the pipe on the slope, not ending on bare soil.',
        'Section',
        '<path d="M24 120 L140 120 L320 210 L24 230 Z" fill="currentColor" fill-opacity=".07" stroke="currentColor"/>' +
        '<path d="M50 120 Q80 80 120 120" fill="currentColor" fill-opacity=".2" stroke="currentColor"/>' +
        '<path d="M96 108 C150 130 220 170 300 196" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>' +
        '<line x1="160" y1="140" x2="150" y2="168" stroke="currentColor" stroke-width="2"/>' +
        '<line x1="210" y1="164" x2="200" y2="192" stroke="currentColor" stroke-width="2"/>' +
        '<circle cx="312" cy="206" r="8" fill="none" stroke="currentColor"/><circle cx="330" cy="214" r="6" fill="none" stroke="currentColor"/>' +
        arrow(30, 90, 70, 110) +
        tx(24, 64, 'Berm higher than the pipe') + tx(150, 100, 'Anchors') + tx(250, 180, 'Rock outlet'),
        'Plan',
        '<path d="M40 360 L300 480 L360 500 L80 380 Z" fill="currentColor" fill-opacity=".05" stroke="currentColor"/>' +
        '<path d="M70 370 Q100 350 130 378" fill="currentColor" fill-opacity=".2" stroke="currentColor"/>' +
        '<path d="M110 372 C180 400 240 450 310 490" fill="none" stroke="currentColor" stroke-width="4"/>' +
        '<circle cx="320" cy="496" r="8" fill="none" stroke="currentColor"/>' +
        tx(24, 330, 'One pipe, one berm') + tx(180, 516, 'Outlet on rock, not bare soil'))
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
      svg: duo('Outlet protection. Section shows rock at or below the pipe invert, with bedding under it, lined up with the flow. Plan shows the apron widening downstream, not piled beside the pipe.',
        'Section',
        '<path d="M24 150 L150 150 L150 178 L300 190 L300 220 L24 220 Z" fill="currentColor" fill-opacity=".06" stroke="currentColor"/>' +
        '<rect x="24" y="150" width="130" height="28" fill="none" stroke="currentColor" stroke-width="2"/>' +
        '<path d="M150 178 L300 190" fill="none" stroke="currentColor" stroke-dasharray="4 3"/>' +
        '<circle cx="180" cy="186" r="7" fill="none" stroke="currentColor"/><circle cx="206" cy="190" r="8" fill="none" stroke="currentColor"/><circle cx="234" cy="194" r="7" fill="none" stroke="currentColor"/><circle cx="262" cy="198" r="8" fill="none" stroke="currentColor"/>' +
        '<path d="M150 168 L168 168" fill="none" stroke="currentColor" stroke-width="2"/>' +
        arrow(40, 164, 140, 164) +
        tx(24, 64, 'Invert stays open') + tx(160, 140, 'Rock at or below the invert') + tx(160, 230, 'Bedding under the rock'),
        'Plan',
        '<rect x="24" y="390" width="90" height="40" fill="none" stroke="currentColor" stroke-width="2"/>' +
        '<path d="M114 390 L280 340 L280 480 L114 430 Z" fill="currentColor" fill-opacity=".12" stroke="currentColor"/>' +
        '<circle cx="160" cy="400" r="6" fill="none" stroke="currentColor"/><circle cx="190" cy="420" r="7" fill="none" stroke="currentColor"/><circle cx="220" cy="390" r="6" fill="none" stroke="currentColor"/><circle cx="230" cy="440" r="7" fill="none" stroke="currentColor"/>' +
        arrow(40, 410, 110, 410) +
        tx(24, 330, 'Pipe') + tx(150, 360, 'Apron in line with the flow') + tx(24, 516, 'Wider as it goes downstream'))
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
      svg: duo('Dewatering. The hose runs from the trench to a filter bag on flat ground, then onto grass. A second hose toward an inlet is crossed out.',
        'Section',
        '<path d="M24 160 L90 160 L110 220 L40 220 Z" fill="currentColor" fill-opacity=".16" stroke="currentColor"/>' +
        '<rect x="40" y="130" width="30" height="22" fill="none" stroke="currentColor" stroke-width="2"/>' +
        '<path d="M70 140 H130" fill="none" stroke="currentColor" stroke-width="2"/>' +
        '<ellipse cx="180" cy="150" rx="46" ry="20" fill="currentColor" fill-opacity=".18" stroke="currentColor" stroke-width="2"/>' +
        '<path d="M220 160 H270" fill="none" stroke="currentColor" stroke-width="2"/>' +
        '<rect x="270" y="150" width="80" height="80" fill="currentColor" fill-opacity=".12" stroke="currentColor"/>' +
        '<path d="M300 130 q8 10 0 18 M320 126 q8 10 0 18" fill="none" stroke="currentColor"/>' +
        tx(24, 64, 'Muddy trench') + tx(150, 120, 'Bag on flat ground') + tx(280, 140, 'Grass'),
        'Plan',
        '<rect x="30" y="360" width="70" height="50" fill="currentColor" fill-opacity=".14" stroke="currentColor"/>' +
        '<ellipse cx="180" cy="385" rx="40" ry="18" fill="currentColor" fill-opacity=".16" stroke="currentColor"/>' +
        '<path d="M100 385 H140" fill="none" stroke="currentColor" stroke-width="2"/>' +
        '<rect x="250" y="340" width="70" height="50" fill="none" stroke="currentColor"/>' +
        '<path d="M200 400 L250 450" fill="none" stroke="currentColor" stroke-width="2"/>' +
        '<path d="M230 430 L270 470 M270 430 L230 470" fill="none" stroke="currentColor" stroke-width="2"/>' +
        '<rect x="300" y="450" width="50" height="30" fill="none" stroke="currentColor" stroke-width="2"/>' +
        tx(24, 330, 'Pump to the bag') + tx(250, 330, 'Not the inlet') + tx(24, 516, 'Bag discharge onto grass'))
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
      svg: duo('Construction exit. Section shows coarse rock over fabric, above the mud, thick enough that tires ride on rock. Plan shows the pad long in the direction of travel, draining to a trap and not into the gutter.',
        'Section',
        '<path d="M24 190 L372 190 L372 246 L24 246 Z" fill="currentColor" fill-opacity=".1"/>' +
        '<path d="M120 190 L130 150 L270 150 L280 190 Z" fill="currentColor" fill-opacity=".05" stroke="currentColor"/>' +
        '<path d="M130 168 L270 168" fill="none" stroke="currentColor" stroke-dasharray="4 3"/>' +
        '<circle cx="160" cy="160" r="6" fill="none" stroke="currentColor"/><circle cx="186" cy="164" r="6" fill="none" stroke="currentColor"/><circle cx="214" cy="158" r="7" fill="none" stroke="currentColor"/><circle cx="240" cy="164" r="6" fill="none" stroke="currentColor"/>' +
        '<rect x="175" y="126" width="50" height="22" rx="3" fill="none" stroke="currentColor"/>' +
        '<circle cx="186" cy="150" r="6" fill="none" stroke="currentColor"/><circle cx="214" cy="150" r="6" fill="none" stroke="currentColor"/>' +
        tx(24, 70, 'Fabric under the rock') + tx(24, 140, 'Tires on rock, not mud') + tx(24, 230, 'Mud under the pad'),
        'Plan',
        '<rect x="24" y="340" width="90" height="150" fill="currentColor" fill-opacity=".08" stroke="currentColor"/>' +
        '<rect x="114" y="360" width="150" height="110" fill="currentColor" fill-opacity=".18" stroke="currentColor"/>' +
        '<rect x="264" y="340" width="100" height="150" fill="currentColor" fill-opacity=".04" stroke="currentColor"/>' +
        '<path d="M180 470 L180 510 L230 510" fill="none" stroke="currentColor" stroke-width="2"/>' +
        arrow(60, 400, 110, 400) +
        tx(30, 328, 'Dirt') + tx(150, 348, 'Rock, long way') + tx(270, 328, 'Pavement') + tx(24, 516, 'Drain the pad to a trap'))
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
      svg: duo('Street sweeping. Plan shows a sweeper picking mud up into a hopper. A hose toward the inlet is crossed out.',
        'Plan',
        '<rect x="24" y="70" width="350" height="150" fill="currentColor" fill-opacity=".04" stroke="currentColor"/>' +
        '<path d="M24 145 H372" fill="none" stroke="currentColor" stroke-dasharray="8 6" stroke-opacity=".5"/>' +
        '<path d="M40 160 H130" fill="none" stroke="currentColor" stroke-width="6" stroke-opacity=".35" stroke-linecap="round"/>' +
        '<rect x="160" y="110" width="90" height="36" rx="4" fill="currentColor" fill-opacity=".16" stroke="currentColor"/>' +
        '<circle cx="178" cy="156" r="10" fill="none" stroke="currentColor"/><circle cx="230" cy="156" r="10" fill="none" stroke="currentColor"/>' +
        '<rect x="300" y="100" width="40" height="28" fill="none" stroke="currentColor"/>' +
        '<path d="M250 120 L290 100" fill="none" stroke="currentColor" stroke-width="2"/>' +
        '<path d="M270 96 L310 136 M310 96 L270 136" fill="none" stroke="currentColor" stroke-width="2"/>' +
        tx(40, 60, 'Tracked mud') + tx(160, 100, 'Hopper') + tx(280, 90, 'Inlet') + tx(24, 240, 'Pick it up. Do not wash it.'),
        'Where it goes',
        '<rect x="40" y="340" width="120" height="80" rx="6" fill="currentColor" fill-opacity=".1" stroke="currentColor"/>' +
        '<path d="M160 380 H230" fill="none" stroke="currentColor" stroke-width="2"/>' +
        '<rect x="230" y="350" width="80" height="60" fill="none" stroke="currentColor" stroke-width="2"/>' +
        '<path d="M270 330 L300 360 M300 330 L270 360" fill="none" stroke="currentColor" stroke-width="2"/>' +
        tx(50, 330, 'Sweepings') + tx(230, 330, 'Not the ditch') + tx(24, 500, 'Same pile as other sediment') + tx(24, 516, 'If you sweep all day, fix the exit'))
    },
    {
      id: 'floating-turbidity', cat: 'water', name: 'Floating turbidity barrier', sheet: 'EC sheet for turbidity barriers',
      one: 'A floating silt curtain that keeps muddy water on the work side of a creek or pond.',
      what: 'A fabric skirt hung from floats on the water surface, with a weighted bottom so the current cannot lift it. It holds turbid water next to the work while soil settles. It is not a silt fence, and it does not stop the whole river. People also call it a turbidity curtain or a floating silt fence.',
      where: [
        'Work in or next to a creek, pond, ditch that already has water, or a bridge bent in the water.',
        'Still or slow water is where a curtain can hold a quiet pool. A fast river will carry the skirt or flow under it. The sheet will say where a curtain is the wrong tool.',
        'The ends have to land on the bank or on another curtain. An end that stops in open water is a hole.'
      ],
      install: [
        'Floats stay at the surface. The skirt hangs in the water column. A chain, cable, or ballast weights the bottom hem so the skirt stays down.',
        'Anchor the curtain so it cannot drift into the work or into the channel you are trying to keep open. Tie both ends to the shore, or to a line that reaches the shore.',
        'Set it before the digging starts, on the downstream side of the work or around the work area, the way the layout shows.',
        'Depth, fabric, and anchor pattern are on the current TxDOT turbidity-barrier sheet. Check that sheet. Do not guess a skirt length from the depth of a different creek.'
      ],
      maintain: [
        'After a rise in the water, check that the floats are still on the surface, the skirt is not rolled up, and the ends are still on the bank.',
        'Clear debris that has pulled a float under. A submerged float is a fence lying on the bottom.',
        'Take the curtain out when the in-water work is done and the bank is stable. Do not leave it as a permanent boom.'
      ],
      mistakes: [
        'A silt fence staked in the mud at the waterline and called a turbidity barrier.',
        'Skirt with no weight, so the current folds it up to the floats.',
        'Ends that do not reach the bank, so the muddy water walks around.',
        'Curtain across the whole channel in a storm, when the sheet wanted it only around the work.',
        'No curtain at all because the crossing "is only for a day."'
      ],
      confirm: 'Skirt depth, float size, ballast, and anchors are on the current TxDOT turbidity-barrier sheet. Check it before you put a depth on the plan. This page does not pick one.',
      svg: duo('Floating turbidity barrier. Floats sit on the water surface, a weighted skirt hangs in the water, and anchors hold the line. In plan the ends tie to the bank so the current cannot go around.',
        'Section',
        '<path d="M24 150 L70 150 L70 246 L24 246 Z" fill="currentColor" fill-opacity=".1"/>' +
        '<path d="M70 160 L372 170 L372 246 L70 246 Z" fill="currentColor" fill-opacity=".14"/>' +
        '<path d="M70 160 L372 170" fill="none" stroke="currentColor" stroke-width="2"/>' +
        '<ellipse cx="180" cy="158" rx="16" ry="8" fill="currentColor" fill-opacity=".08" stroke="currentColor" stroke-width="2"/>' +
        '<ellipse cx="214" cy="160" rx="16" ry="8" fill="currentColor" fill-opacity=".08" stroke="currentColor" stroke-width="2"/>' +
        '<path d="M180 166 L176 220 M214 168 L220 222 M176 220 L220 222" fill="none" stroke="currentColor" stroke-width="2"/>' +
        '<circle cx="184" cy="224" r="4" fill="currentColor"/><circle cx="204" cy="226" r="4" fill="currentColor"/><circle cx="196" cy="230" r="3" fill="currentColor"/>' +
        '<path d="M176 220 L110 200" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="3 2"/>' +
        arrow(250, 200, 340, 205) +
        tx(24, 64, 'Bank') + tx(150, 120, 'Floats') + tx(230, 200, 'Weighted skirt') + tx(250, 190, 'Current'),
        'Plan',
        '<path d="M24 340 L24 500 L80 470 L80 360 Z" fill="currentColor" fill-opacity=".1" stroke="currentColor"/>' +
        '<path d="M80 400 L200 380 L320 400" fill="none" stroke="currentColor" stroke-width="3"/>' +
        '<ellipse cx="140" cy="388" rx="14" ry="6" fill="none" stroke="currentColor"/><ellipse cx="200" cy="380" rx="14" ry="6" fill="none" stroke="currentColor"/><ellipse cx="260" cy="388" rx="14" ry="6" fill="none" stroke="currentColor"/>' +
        '<path d="M200 386 L200 430" fill="none" stroke="currentColor" stroke-dasharray="3 2"/>' +
        '<circle cx="200" cy="436" r="5" fill="none" stroke="currentColor"/>' +
        arrow(120, 460, 240, 460) +
        tx(90, 330, 'Tied to the bank') + tx(24, 516, 'Current. Ends do not stop in open water'))
    },
    {
      id: 'stream-crossing', cat: 'water', name: 'Temporary stream crossing', sheet: 'EC sheet and the water permit',
      one: 'A pipe-and-rock crossing so equipment does not drive in the creek bed.',
      what: 'A short, temporary way across a channel. Low flow goes through pipes set at the bed. Clean rock covers the pipes so tires stay out of the water. The approaches are stable, and the whole thing comes out when you are done. Driving through the mud is not a crossing. A curtain downstream does not make a mud ford acceptable.',
      where: [
        'Where haul equipment has to cross a creek or a wet ditch, and the layout shows a crossing.',
        'Not at every wet spot. One crossing, in the place the plan picked, is easier to build and remove.',
        'Work in a waterway can need a permit besides the construction general permit. The SWP3 does not replace that.'
      ],
      install: [
        'Set the pipes on the bed so the ordinary low flow stays in the pipes and does not dam up behind the rock.',
        'Cover the pipes with clean rock. If the sheet shows geotextile under the rock, put it there so fines do not migrate into the rock.',
        'Tie the rock into both banks and stabilize the approaches so mud is not dragged onto the crossing.',
        'Pipe size, number, and rock are a hydraulic choice on the current sheet and the crossing design. Check those. This page does not size a culvert.',
        'Have the removal and the bank restoration on the plan before you build it.'
      ],
      maintain: [
        'Clear debris at the pipe mouths so the crossing does not become a dam.',
        'Replace rock that has washed downstream, and keep equipment on the crossing rather than beside it.',
        'If the water is overtopping in ordinary weather, the pipes are too small or plugged. Stop and fix it. Do not add another foot of dirt.'
      ],
      mistakes: [
        'A mud ford with a turbidity curtain downstream and no pipes.',
        'Pipes set high, so the rock dams the creek and the banks wash out.',
        'Dirt fill instead of clean rock, which becomes the sediment load.',
        'Leaving the crossing in place after the haul is finished.',
        'Approaches that rut, so every trip carries a new load of mud into the channel.'
      ],
      confirm: 'Pipe size, rock, and whether a permit is required are on the current TxDOT sheet and in the project water permits. Check those. Do not reuse a pipe diameter from another creek.',
      svg: duo('Temporary stream crossing. Section shows pipes at the bed, clean rock over them, and stable approaches. Plan shows the crossing square to the channel, not a path through the mud.',
        'Section',
        '<path d="M24 120 L110 200 L290 200 L376 120" fill="none" stroke="currentColor" stroke-width="2"/>' +
        '<path d="M110 200 L290 200 L290 246 L110 246 Z" fill="currentColor" fill-opacity=".08"/>' +
        '<path d="M120 168 L280 168 L290 200 L110 200 Z" fill="currentColor" fill-opacity=".16" stroke="currentColor"/>' +
        '<circle cx="160" cy="186" r="14" fill="currentColor" fill-opacity=".04" stroke="currentColor" stroke-width="2"/>' +
        '<circle cx="200" cy="186" r="14" fill="currentColor" fill-opacity=".04" stroke="currentColor" stroke-width="2"/>' +
        '<circle cx="240" cy="186" r="14" fill="currentColor" fill-opacity=".04" stroke="currentColor" stroke-width="2"/>' +
        '<path d="M120 174 L280 174" fill="none" stroke="currentColor" stroke-dasharray="4 3"/>' +
        tx(24, 64, 'Approach') + tx(150, 158, 'Clean rock') + tx(120, 230, 'Pipes sit on the bed'),
        'Plan',
        '<path d="M150 320 L170 520 L230 520 L250 320 Z" fill="currentColor" fill-opacity=".12" stroke="currentColor"/>' +
        '<rect x="80" y="390" width="240" height="70" fill="currentColor" fill-opacity=".16" stroke="currentColor"/>' +
        '<circle cx="200" cy="400" r="8" fill="none" stroke="currentColor"/><circle cx="176" cy="400" r="8" fill="none" stroke="currentColor"/><circle cx="224" cy="400" r="8" fill="none" stroke="currentColor"/>' +
        arrow(200, 330, 200, 370) +
        tx(24, 360, 'Approaches') + tx(24, 430, 'Rock') + tx(24, 516, 'Flow stays in the pipes'))
    },
    {
      id: 'concrete-washout', cat: 'road', name: 'Concrete washout', sheet: 'SWP3 pollution-prevention note',
      one: 'A lined pit or a container for concrete wash water. Not the gutter.',
      what: 'A place to wash chutes and tools so concrete slurry does not reach a ditch, an inlet, or a creek. It is a leak-proof pit or a portable container, signed, and easy for the driver to use. A sediment bag does not treat concrete wash water. The solids are waste, not fill in the roadside ditch.',
      where: [
        'Near the concrete work, on the layout, away from inlets, ditches, and the vegetated buffer.',
        'Where a truck can reach it without backing across the silt fence.',
        'Not "behind the job trailer" if that spot drains to the curb.'
      ],
      install: [
        'Line an earthen pit so wash water cannot soak out, or use a container that does not leak. Berm the pit or keep the container closed enough that rain does not overflow it.',
        'Put a sign on it. An unsigned hole gets used as a dumpster, or it gets ignored.',
        'Cover it or pump it down before a storm if rain would overflow the pit. Overflow is a discharge of concrete water.',
        'The project SWP3 and the current TxDOT note say how washout is handled and where the waste goes. Check those. Do not invent a pit size here.'
      ],
      maintain: [
        'Empty the pit or the container before it is full. Hardened concrete comes out as solid waste.',
        'Repair a torn liner the day you find it.',
        'If drivers are washing out on the ground, the washout is in the wrong place or it is full. Move it or empty it.'
      ],
      mistakes: [
        'Washing the chute into the inlet because the washout is across the job.',
        'A pit with no liner, dug in sandy soil.',
        'Dumping the slurry in a low spot and calling it a washout.',
        'Sending concrete water through a dewatering bag.',
        'Leaving a full pit at the end of the job for the next rain to overflow.'
      ],
      confirm: 'Where the washout goes, how it is lined, and how the waste is hauled are in the current project SWP3 and TxDOT notes. Check those. This page does not size the pit.',
      svg: duo('Concrete washout. Section shows a lined pit below the surrounding ground, with a sign. Plan shows it away from the inlet, with no pipe between them.',
        'Section',
        '<path d="M24 150 L80 150 L110 220 L250 220 L280 150 L372 150 L372 246 L24 246 Z" fill="currentColor" fill-opacity=".06" stroke="currentColor"/>' +
        '<path d="M100 160 L124 214 L236 214 L260 160" fill="none" stroke="currentColor" stroke-width="2"/>' +
        '<path d="M108 168 L130 208 L230 208 L252 168" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="4 3"/>' +
        '<path d="M140 190 L220 190" fill="none" stroke="currentColor" stroke-width="4" stroke-opacity=".35"/>' +
        '<rect x="300" y="110" width="36" height="24" fill="none" stroke="currentColor"/>' +
        '<line x1="318" y1="134" x2="318" y2="150" stroke="currentColor" stroke-width="2"/>' +
        tx(24, 70, 'Lined pit') + tx(140, 180, 'Wash water') + tx(290, 100, 'Sign') + tx(24, 236, 'Below the surrounding ground'),
        'Plan',
        '<rect x="50" y="360" width="120" height="90" fill="currentColor" fill-opacity=".1" stroke="currentColor"/>' +
        '<rect x="62" y="372" width="96" height="66" fill="none" stroke="currentColor" stroke-dasharray="4 3"/>' +
        '<rect x="280" y="380" width="50" height="36" fill="none" stroke="currentColor" stroke-width="2"/>' +
        '<path d="M170 400 L250 400" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="4 3"/>' +
        '<path d="M230 384 L262 416 M262 384 L230 416" fill="none" stroke="currentColor" stroke-width="2"/>' +
        tx(60, 340, 'Washout') + tx(270, 360, 'Inlet') + tx(24, 500, 'No hose and no ditch between them') + tx(24, 516, 'Sign it so the driver can find it'))
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
