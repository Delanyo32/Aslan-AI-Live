import { Polar } from "@polar-sh/sdk"
import { env } from "$env/dynamic/private"

let _polar: Polar | undefined
export function getPolar(): Polar {
	return (_polar ??= new Polar({ accessToken: env.POLAR_ACCESS_TOKEN }))
}
