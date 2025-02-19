import { chromium } from "playwright"

const map = {}

const browser = await chromium.launch()
const ctx = await browser.newContext()
const page = await ctx.newPage()

async function find(url: string) {

	console.log(`searching under ${url}`)
	await page.goto(url)
	await Bun.sleep(2000)

	const covers = await page.locator("magazine-cover").all()

	for (const cover of covers) {
		const issue = await cover.getAttribute("issue")
		const path = await cover.getAttribute("path")
		const { id, name }: { id: number, name: string } = JSON.parse(issue)
		if (path.endsWith("spread/1")) {
			const num = name
				.match(/\(Issue\s(?<num>.+)\)/)
				?.groups["num"]
				.split(" ")
				.join("")
			map[num] = id
			console.log(`${num}: ${id}`)
		} else {
			await find(`https://reader.exacteditions.com${path}`)
		}
	}

}

await find("https://reader.exacteditions.com/magazines/493/issues")
await browser.close()

Bun.write("id.json", JSON.stringify(map))
