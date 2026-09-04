export interface StoreConfig {
  name: string;
  address: string;
  tradingHours: string;
  staffContact: string;
  did: string;
}

export const STORE_MAPPING: Record<string, StoreConfig> = {
  '0872286100': {
    name: 'Marion',
    address: 'Kiosk 204 Westfield, 297 Diagonal Rd, Oaklands Park SA 5046',
    tradingHours: 'Mon-Wed & Fri 9:00am–5:30pm, Thu 9:00am–9:00pm, Sat 9:00am–5:00pm, Sun 11:00am–5:00pm',
    staffContact: '0872286100',
    did: '0872286100',
  },
  '09821200012062': {
    name: 'Enex Pert',
    address: 'Shop ST105 Level 1 Enex Perth, 100 St Georges Terrace, Perth WA 6000',
    tradingHours: 'Mon-Fri 9:00am–6:00pm, Sat: close, Sun: close',
    staffContact: '61892260988',
    did: '09821200012062',
  },
  '61892260988': {
    name: 'Enex Pert',
    address: 'Shop ST105 Level 1 Enex Perth, 100 St Georges Terrace, Perth WA 6000',
    tradingHours: 'Mon-Fri 9:00am–6:00pm, Sat: close, Sun: close',
    staffContact: '61892260988',
    did: '61892260988',
  },
  '61370360442': {
    name: 'Traralgon',
    address: 'Traralgon Centre Plaza, 166-188 Franklin St, Traralgon VIC 3844',
    tradingHours: 'Mon-Wed 9:00am–5:30pm, Thu-Fri 9:00am–9:00pm, Sat 10:00am–4:00pm, Sun 9:00am–5:30pm',
    staffContact: '61370360442',
    did: '61370360442',
  },
  '09821200012620': {
    name: 'Traralgon',
    address: 'Traralgon Centre Plaza, 166-188 Franklin St, Traralgon VIC 3844',
    tradingHours: 'Mon-Wed 9:00am–5:30pm, Thu-Fri 9:00am–9:00pm, Sat 10:00am–4:00pm, Sun 9:00am–5:30pm',
    staffContact: '61370360442',
    did: '09821200012620',
  },
  '0370360236': {
    name: 'Tok H',
    address: 'Shop 9, Tok H Centre, 459-465 Toorak Rd, Toorak VIC 3142',
    tradingHours: 'Mon-Fri 9:00am–5:30pm, Sat 9:00am–6:00pm, Sun: 10:00 AM – 5:00 PM',
    staffContact: '0370360236',
    did: '0370360236',
  },
  '0863652926': {
    name: 'Dianella',
    address: 'Kiosk KI001, Dianella Plaza, 366 Grand Promenade, Dianella WA 6059',
    tradingHours: 'Mon-Wed & Fri 9:00am–5:30pm, Thu 9:00am–9:00pm, Sat 9:00am–5:00pm, Sun 11:00am–5:00pm',
    staffContact: '0863652926',
    did: '0863652926',
  },
  '0861868180': {
    name: 'The Mezz',
    address: 'TKiosk 1/148 Scarborough Beach Rd, The Hawaiian Mezz, Mount Hawthorn WA 6016',
    tradingHours: 'Mon-Fri 9:00am–5:30pm, Sat 9:00am–5:00pm, Sun: close',
    staffContact: '0861868180',
    did: '0861868180',
  },
  '0738214854': {
    name: 'Cleveland',
    address: 'Shop K02/91 Middle St, Cleveland Central, Cleveland QLD 4163',
    tradingHours: 'Mon-Wed & Fri 9:00am–5:30pm, Thu 9:00am–6:00pm, Sat 9:00am–5:00pm, Sun 10:00am–4:00pm',
    staffContact: '0738214854',
    did: '0738214854',
  },
};
