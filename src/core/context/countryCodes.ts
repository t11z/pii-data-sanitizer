/**
 * ISO 3166-1 alpha-2 and alpha-3 country codes (plus Kosovo's user-assigned
 * `XK` / ICAO `RKS`, which appear on real travel documents).
 *
 * Used by the passport detector to tell an *issuing-country* prefix apart from
 * a letter group that belongs to the number itself. "Passport GB 77213Q4" and
 * "Passport: GBR 123456789" carry the issuer as metadata — only the number is
 * the identifier — whereas "Passport AB 1234567" (no country "AB") is far more
 * likely a number printed with an internal space, and masking only "1234567"
 * there would leave part of the identifier visible.
 *
 * Why a list rather than a shape: nothing in the surface form separates "GB"
 * from "AB" — both are two uppercase letters — so only membership in the
 * closed, public-domain ISO set can make the distinction. The set changes
 * rarely and generalises to every issuer, not just ones the corpus carries.
 */
const ALPHA2 =
  'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ ' +
  'BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM ' +
  'DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS ' +
  'GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN ' +
  'KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ ' +
  'MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM ' +
  'PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV ' +
  'SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI ' +
  'VN VU WF WS YE YT ZA ZM ZW XK';

const ALPHA3 =
  'AFG ALA ALB DZA ASM AND AGO AIA ATA ATG ARG ARM ABW AUS AUT AZE BHS BHR BGD BRB BLR BEL ' +
  'BLZ BEN BMU BTN BOL BES BIH BWA BVT BRA IOT BRN BGR BFA BDI CPV KHM CMR CAN CYM CAF TCD ' +
  'CHL CHN CXR CCK COL COM COG COD COK CRI CIV HRV CUB CUW CYP CZE DNK DJI DMA DOM ECU EGY ' +
  'SLV GNQ ERI EST SWZ ETH FLK FRO FJI FIN FRA GUF PYF ATF GAB GMB GEO DEU GHA GIB GRC GRL ' +
  'GRD GLP GUM GTM GGY GIN GNB GUY HTI HMD VAT HND HKG HUN ISL IND IDN IRN IRQ IRL IMN ISR ' +
  'ITA JAM JPN JEY JOR KAZ KEN KIR PRK KOR KWT KGZ LAO LVA LBN LSO LBR LBY LIE LTU LUX MAC ' +
  'MDG MWI MYS MDV MLI MLT MHL MTQ MRT MUS MYT MEX FSM MDA MCO MNG MNE MSR MAR MOZ MMR NAM ' +
  'NRU NPL NLD NCL NZL NIC NER NGA NIU NFK MKD MNP NOR OMN PAK PLW PSE PAN PNG PRY PER PHL ' +
  'PCN POL PRT PRI QAT REU ROU RUS RWA BLM SHN KNA LCA MAF SPM VCT WSM SMR STP SAU SEN SRB ' +
  'SYC SLE SGP SXM SVK SVN SLB SOM ZAF SGS SSD ESP LKA SDN SUR SJM SWE CHE SYR TWN TJK TZA ' +
  'THA TLS TGO TKL TON TTO TUN TUR TKM TCA TUV UGA UKR ARE GBR USA UMI URY UZB VUT VEN VNM ' +
  'VGB VIR WLF ESH YEM ZMB ZWE RKS';

const COUNTRY_CODES = new Set<string>([...ALPHA2.split(' '), ...ALPHA3.split(' ')]);

/** True for an uppercase ISO 3166-1 alpha-2 / alpha-3 country code. */
export function isCountryCode(code: string): boolean {
  return COUNTRY_CODES.has(code);
}
