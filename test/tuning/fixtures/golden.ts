export interface GoldenQuery {
	query: string;
	date: string;
	note?: string;
}

// Queries a user types when reciting dialogue: near-verbatim, in order, and often slightly
// wrong. `note` records the deliberate corruption so a regression can be read at a glance.
export const RECITED: GoldenQuery[] = [
	{ query: "so long pop i'm off to check my tiger trap", date: "1985-11-18" },
	{ query: "tigers will do anything for a tuna fish sandwich", date: "1985-11-18" },
	{ query: "you were the one playing the cymbals", date: "1985-11-20" },
	{ query: "aren't you going to say goodnight to hobbes", date: "1985-11-22", note: "goodnight vs good night" },
	{ query: "you know you'll hate something when they won't tell you what it is", date: "1985-11-23" },
	{ query: "will you check for monsters under the bed", date: "1985-11-24" },
	{
		query: "i'd hate to have to torch one with my flamethrower",
		date: "1985-11-25",
		note: "flamethrower vs flame thrower",
	},
	{ query: "can i work the gas and brakes while you steer", date: "1985-11-26" },
	{ query: "this serene metropolis lies directly beneath the hoover dam", date: "1985-11-27" },
	{ query: "calvin has got to learn some manners he won't starve to death", date: "1985-11-28" },
	{ query: "do you believe in fate that our lives are predestined", date: "1985-11-30", note: "two lines merged" },
	{ query: "i hope you know a good dentist susie", date: "1986-01-14" },
	{ query: "why did you sign me up for this forty minutes of terror", date: "1986-07-26", note: "clauses reordered" },
	{
		query: "i'm going to learn how to ride this bike even if it kills me",
		date: "1986-09-01",
		note: "bike vs bicycle",
	},
	{ query: "it decided to maim me first", date: "1986-09-01" },
	{ query: "don't we even get a few practice semesters", date: "1987-02-02" },
	{ query: "this transmogrifier will turn you into anything at all", date: "1987-03-24" },
	{ query: "you can be an eel a baboon a giant bug or a dinosaur", date: "1987-03-24" },
	{ query: "i've got eight slugs in me one's lead and the rest are bourbon", date: "1987-05-16" },
	{ query: "was he in jail with max that's not a bad guess", date: "1988-01-11", note: "two lines merged" },
	{ query: "and that means you've probably hired rosalyn again", date: "1989-02-06" },
	{ query: "we'll call our club gross get rid of slimy girls", date: "1989-05-17" },
	{ query: "then i get to be king and tyrant", date: "1989-05-17" },
	{ query: "it combines the technologies of the transmogrifier and a photocopier", date: "1990-01-08" },
	{ query: "what about the noodle incident no one can prove i did that", date: "1990-12-12" },
	{ query: "he's turned himself into a deranged mutant killer monster snow goon", date: "1991-01-04" },
	{ query: "how many leaves do you need fifty", date: "1995-10-02", note: "fifty vs 50" },
];

// Queries a user types when they remember the scene but not the words. Several use vocabulary
// that appears only in the description, never in the transcript.
export const DESCRIBED: GoldenQuery[] = [
	{ query: "tuna fish sandwich tiger trap", date: "1985-11-18" },
	{ query: "cymbals jumping on the bed", date: "1985-11-20" },
	{ query: "put your tiger in your locker", date: "1985-11-21" },
	{ query: "monsters under the bed dart gun horn", date: "1985-11-24" },
	{ query: "flamethrower monsters", date: "1985-11-25" },
	{ query: "steer the car gas and brakes", date: "1985-11-26" },
	{ query: "sandbox hoover dam", date: "1985-11-27", note: "sandbox is description-only" },
	{ query: "smells like bat barf sent to his room", date: "1985-11-28" },
	{ query: "spaceman spiff hall pass principal", date: "1985-11-29" },
	{ query: "wagon predestined fate", date: "1985-11-30", note: "wagon is description-only" },
	{ query: "note for jessica squealer", date: "1986-01-14" },
	{ query: "piano lessons hang gliding sharpshooting", date: "1986-07-26" },
	{ query: "learning to ride a bicycle crash", date: "1986-09-01" },
	{ query: "report cards being graded", date: "1987-02-02" },
	{ query: "transmogrifier dial chemical configuration", date: "1987-03-24" },
	{ query: "tracer bullet private eye brunette", date: "1987-05-16" },
	{ query: "uncle max con man swindle", date: "1988-01-11" },
	{ query: "rosalyn babysitter shower", date: "1989-02-06" },
	{ query: "gross club elect officers king tyrant", date: "1989-05-17" },
	{ query: "duplicator counterfeiting photocopier", date: "1990-01-08" },
	{ query: "mailed letter to santa in a box", date: "1990-12-12" },
	{ query: "snowman gives himself two heads", date: "1991-01-04" },
	{ query: "collect fifty different leaves", date: "1995-10-02" },
];
