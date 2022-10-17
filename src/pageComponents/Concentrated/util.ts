import { ApiAmmV3Point } from '@raydium-io/raydium-sdk'
import { SplToken } from '@/application/token/type'
import { isMintEqual } from '@/functions/judgers/areEqual'
import { ChartPoint } from './type'
import { Numberish } from '@/types/constants'
import { gt } from '@/functions/numberish/compare'
import { div, sub, mul } from '@/functions/numberish/operations'
import toFraction from '@/functions/numberish/toFraction'
import { Fraction } from '@raydium-io/raydium-sdk'

export function canTokenPairBeSelected(targetToken: SplToken | undefined, candidateToken: SplToken | undefined) {
  return !isMintEqual(targetToken?.mint, candidateToken?.mint)
}

export function toXYChartFormat(points: ApiAmmV3Point[]): ChartPoint[] {
  return points.map(({ liquidity, price }) => ({
    x: Number(price),
    y: Number(liquidity)
  }))
}

interface CalculateProps {
  coin1Amount?: Numberish
  coin2Amount?: Numberish
  currentPrice?: Fraction
  coin1InputDisabled: boolean
  coin2InputDisabled: boolean
}
export function calculateRatio({
  coin1Amount,
  coin2Amount,
  currentPrice,
  coin1InputDisabled,
  coin2InputDisabled
}: CalculateProps): { ratio1: string; ratio2: string } {
  const [amount1, amount2] = [(coin1InputDisabled ? '0' : coin1Amount) || '0', coin2InputDisabled ? '0' : coin2Amount]
  const [amount1HasVal, amount2HasVal] = [gt(amount1, 0), gt(amount2, 0)]
  const amount2Fraction = toFraction(amount2 || '0')
  const denominator = currentPrice
    ? amount1HasVal
      ? mul(amount1, currentPrice).add(amount2Fraction)
      : amount2HasVal
      ? amount2Fraction
      : toFraction(1)
    : toFraction(1)

  return {
    ratio1: currentPrice ? mul(amount1, currentPrice).div(denominator).mul(100).toFixed(1) : '0',
    ratio2: currentPrice ? div(amount2Fraction, denominator).mul(100).toFixed(1) : '0'
  }
}
