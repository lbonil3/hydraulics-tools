/* Capture Terminal: where to look for opportunities.
   Every URL below was opened (HTTP 200) while building this tool on 2026-10-25 (America/Chicago).
   `v` says how: 'curl' = plain HTTP request returned 200; 'fetch' = loaded by a fetch tool (the site blocks curl with 403).
   Nothing here is an opportunity; these are places to look. Pages change: verify at the source. */
(function (root) {
  var SOURCES = [
    { g: 'TxDOT consultant procurement (PEPS)', items: [
      { n: 'PEPS home: engineering, architectural & surveying consultants', u: 'https://www.txdot.gov/business/peps.html', v: 'curl',
        d: 'Hub for TxDOT Professional Engineering Procurement Services (PEPS): procurement process, administrative qualification, projected contracts list.' },
      { n: 'Projected contracts list, FY2027 (Excel)', u: 'https://www.txdot.gov/content/dam/docs/division/ppd/projected-contracts/projected-contracts-list-2027.xlsx', v: 'curl',
        d: 'TxDOT list of anticipated A/E/S contracts. Columns include est. advertisement date, discipline, managing district/division, PEPS service center, description, county/district, specific vs indefinite deliverable, funding type, est. max contract value, pre-solicitation meeting. Subject to change.' },
      { n: 'Fiscal year procurement plan', u: 'https://www.txdot.gov/business/peps/opportunities/fiscal-year-procurement-plan.html', v: 'curl',
        d: 'How PEPS plans professional-services procurements in waves over the current and next fiscal year.' },
      { n: 'PEPS contract advertisements / Euna eSET', u: 'https://www.txdot.gov/business/peps/opportunities/peps-contract-advertisements.html', v: 'curl',
        d: 'TxDOT says PEPS procurements are posted in the Euna Procurement eSET (formerly Bonfire) before each wave; responses are submitted there.' },
      { n: 'TxDOT procurement portal (Euna / Bonfire)', u: 'https://txdot.bonfirehub.com/', v: 'curl',
        d: 'Portal where TxDOT PEPS solicitations are viewed and answered. Registration is needed to respond. TxDOT\'s Bonfire FAQ also says PEPS solicitations are posted on ESBD.' },
      { n: 'Consultants selected for negotiations (shortlists)', u: 'https://www.txdot.gov/business/peps/opportunities/consultants-selected-for-negotiations.html', v: 'curl',
        d: 'Past procurements by Project ID, closing date, wave, work type (e.g. PS&E) and service center. Use for who was selected (incumbents/competitors) and for typical timing.' },
      { n: 'PEPS service centers (incl. Houston Service Center)', u: 'https://www.txdot.gov/business/peps/service-centers.html', v: 'curl',
        d: 'Says the PEPS Houston Service Center procures contracts and supports work authorizations for the Houston District.' },
      { n: 'Texas SmartBuy / ESBD (Electronic State Business Daily)', u: 'https://www.txsmartbuy.gov/esbd', v: 'curl',
        d: 'State solicitation notices. TxDOT\'s FAQ says all PEPS solicitations are also posted on ESBD.' },
      { n: 'Houston District scientific services contract schedule', u: 'https://www.txdot.gov/about/districts/houston-district/houston-district-schedule-scientific-services-contracts.html', v: 'curl',
        d: 'Houston District RFP schedule for environmental/scientific services. Not drainage PS&E, but shows how the District posts RFPs.' }
    ]},
    { g: 'TxDOT projects and lettings (use to time pursuits)', items: [
      { n: 'Contract letting (statewide letting schedule)', u: 'https://www.txdot.gov/business/road-bridge-maintenance/contract-letting.html', v: 'curl',
        d: 'Monthly statewide construction/maintenance letting dates (Austin, two consecutive days each month). Use for the anticipated letting date.' },
      { n: 'Project letting dashboards (4-year project info, 24-month schedule)', u: 'https://www.txdot.gov/business/road-bridge-maintenance/contract-letting/project-letting-dashboards.html', v: 'curl',
        d: 'Interactive dashboards of projects scheduled to let, filterable by letting date, classification and district. TxDOT says they are informational and subject to change.' },
      { n: 'Project Information dataset (Texas Open Data Portal)', u: 'https://data.texas.gov/dataset/Project-Information/drau-zphx', v: 'curl',
        d: 'TxDOT letting-project data: CSJ, county, district, limits, type of work, estimated cost, letting date. Refreshed hourly per the page. Good source for CSJ and est. construction cost.' },
      { n: 'Project Tracker', u: 'https://www.txdot.gov/projects/project-tracker.html', v: 'curl',
        d: 'TxDOT\'s gateway to 11,000+ projects by highway, project ID, district or county; status from planning to construction. Desktop browser recommended.' },
      { n: 'Plans Online', u: 'https://www.txdot.gov/business/plans-online-bid-lettings.html', v: 'curl',
        d: 'Plans, proposals, addenda and bid tabs for TxDOT lettings.' }
    ]},
    { g: 'Harris County and flood control', items: [
      { n: 'HCFCD current & past bid opportunities (RFPs, RFSQs)', u: 'https://www.hcfcd.org/Community/Work-With-Us/Current-Past-Bid-Opportunities', v: 'curl',
        d: 'Harris County Flood Control District solicitations, including Requests for Statements of Qualifications (RFSQs) for engineering/architectural services.' },
      { n: 'HCFCD 12-month outlook (RFQs / RFPs)', u: 'https://www.hcfcd.org/Resources/Technical-Manuals/12-Month-Outlook-Requests-for-Qualifications-or-Proposals', v: 'curl',
        d: 'HCFCD document list titled 12 Month Outlook Requests for Qualifications or Proposals. Contents of the documents were not reviewed.' },
      { n: 'Harris County open opportunities (Bonfire portal)', u: 'https://harriscountytx.bonfirehub.com/portal/?tab=openOpportunities', v: 'curl',
        d: 'Harris County\'s e-procurement portal for open solicitations. Registration is needed to respond.' },
      { n: 'Harris County Purchasing: online solicitation opportunities', u: 'https://purchasing.harriscountytx.gov/Services/Online-Solicitation-Opportunities', v: 'curl',
        d: 'Harris County Purchasing Department page on where solicitations are posted.' }
    ]},
    { g: 'City of Houston', items: [
      { n: 'Strategic Procurement Division: doing business with the City', u: 'https://www.houstontx.gov/bizwithhou/', v: 'curl',
        d: 'City solicitations, how to do business, procurement plan for the current fiscal year, training.' },
      { n: 'Houston Public Works: Office of Business Opportunity', u: 'https://www.houstonpublicworks.org/office-business-opportunity', v: 'curl',
        d: 'Says HPW solicits professional services through RFQs, vendors must be registered on the vendor portal, and a yearly forecast meeting announces new projects.' }
    ]},
    { g: 'Other Houston-area counties and agencies', items: [
      { n: 'Fort Bend County: current bids / RFPs / RFQs', u: 'https://www.fortbendcountytx.gov/government/departments/purchasing-agent/current-bids-rfps-rfqs-quotes', v: 'curl',
        d: 'Fort Bend County Purchasing page for current solicitations.' },
      { n: 'Fort Bend County open opportunities (Bonfire portal)', u: 'https://fortbendcountytx.bonfirehub.com/portal/?tab=openOpportunities', v: 'curl',
        d: 'Fort Bend County e-procurement portal.' },
      { n: 'Montgomery County: bid and proposal opening dates', u: 'https://www.mctx.org/departments/departments_l_-_p/purchasing/bid_proposal_opening_date.php', v: 'curl',
        d: 'Montgomery County Purchasing bid and proposal schedule.' },
      { n: 'Brazoria County: bid opportunities', u: 'https://www.brazoriacountytx.gov/departments/purchasing/bid-opportunities', v: 'fetch',
        d: 'Says bids are submitted through the County\'s Bonfire portal; vendors register to get notices by NIGP code. (Site returns 403 to curl; page loaded via fetch tool.)' },
      { n: 'Brazoria County Bonfire portal', u: 'https://brazoriacounty.bonfirehub.com/portal/?tab=login', v: 'curl',
        d: 'Brazoria County e-bidding portal linked from the page above.' },
      { n: 'Galveston County: solicitations', u: 'https://www.galvestoncountytx.gov/county-offices/purchasing/solicitations-bids', v: 'fetch',
        d: 'Galveston County Purchasing solicitations page. The page loaded but its list did not render in the fetch tool; curl gets 403. Open it in a browser.' },
      { n: 'H-GAC Transportation Improvement Program (TIP)', u: 'https://www.h-gac.com/transportation-improvement-program', v: 'fetch',
        d: 'Federally funded regional project listings (2027-2030 and 2025-2028 TIP, amendments). Use to see future projects before they are advertised. (curl gets 403; page loaded via fetch tool.)' },
      { n: 'METRO (Houston) procurement opportunities', u: 'https://www.ridemetro.org/about/business-to-business/procurement-opportunities', v: 'curl',
        d: 'METRO vendor solicitations. Vendors must register.' },
      { n: 'Port Houston strategic sourcing', u: 'https://porthouston.com/business/strategic-sourcing/strategic-sourcing-overview/', v: 'curl',
        d: 'Port Houston strategic sourcing overview and how to get solicitation alerts.' }
    ]}
  ];
  var NOT_VERIFIED = [
    'City of Houston eProcurement system ("Beacon Bid" per a City PDF): I did not open a verified URL, so none is listed. Start at the Strategic Procurement Division page.',
    'Port Houston solicitation portal, Galveston County bid portal: not opened; use the pages above.',
    'TxDOT Houston District "upcoming letting" page: I found no separate one. Use the letting dashboards filtered by district.',
    'Contents of linked documents (HCFCD outlook files, TxDOT dashboards) were not reviewed. Dates and scopes change; confirm in the solicitation.',
    'Third-party bid aggregators were seen in search results and are intentionally not listed.'
  ];
  var VERIFIED_ON = '2026-10-25';
  var api = { SOURCES: SOURCES, NOT_VERIFIED: NOT_VERIFIED, VERIFIED_ON: VERIFIED_ON };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.CaptureSources = api;
})(typeof window !== 'undefined' ? window : globalThis);
