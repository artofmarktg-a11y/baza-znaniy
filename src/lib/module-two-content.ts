const careerIntro = `<div class="tr-callout tr-callout--info tr-callout--intro">
  <strong>Добро пожаловать в мир металлоторговли!</strong>
  <p>Это одна из самых стабильных отраслей в стране: люди строили, строят и будут строить всегда. А значит, металл нужен был, есть и будет.</p>
</div>`;

const careerPath = `<div class="tr-career-path">
  <div class="tr-career-path__step">
    <div class="tr-career-path__marker">01</div>
    <div class="tr-career-path__body"><strong>Стажёр</strong><span>Осваивает продукт, CRM, звонки и логику сделки.</span></div>
  </div>
  <div class="tr-career-path__step tr-career-path__step--accent">
    <div class="tr-career-path__marker">02</div>
    <div class="tr-career-path__body"><strong>Менеджер по продажам</strong><span>Ведёт заявки, готовит КП и закрывает первые сделки.</span></div>
  </div>
  <div class="tr-career-path__step">
    <div class="tr-career-path__marker">03</div>
    <div class="tr-career-path__body"><strong>Менеджер по ключевым клиентам</strong><span>Развивает постоянных клиентов и крупные проекты.</span></div>
  </div>
  <div class="tr-career-path__step">
    <div class="tr-career-path__marker">04</div>
    <div class="tr-career-path__body"><strong>Руководитель группы продаж</strong><span>Помогает команде выполнять план и выстраивать работу с клиентами.</span></div>
  </div>
  <div class="tr-career-path__step">
    <div class="tr-career-path__marker">05</div>
    <div class="tr-career-path__body"><strong>РОП</strong><span>Отвечает за результат отдела, маржу и развитие команды.</span></div>
  </div>
</div>`;

const dealRoute = `<div class="tr-deal-route">
  <div class="tr-deal-route__step"><div class="tr-deal-route__marker">1</div><div class="tr-deal-route__body"><strong>Подготовка</strong><span>Узнайте всё о продукте и клиенте. Сформулируйте преимущества.</span></div></div>
  <div class="tr-deal-route__step"><div class="tr-deal-route__marker">2</div><div class="tr-deal-route__body"><strong>Первый звонок</strong><span>Познакомьтесь, выясните потребность и оцените интерес.</span></div></div>
  <div class="tr-deal-route__step"><div class="tr-deal-route__marker">3</div><div class="tr-deal-route__body"><strong>Коммерческое предложение</strong><span>Отправьте не просто прайс, а решение с преимуществами и отзывами.</span></div></div>
  <div class="tr-deal-route__step"><div class="tr-deal-route__marker">4</div><div class="tr-deal-route__body"><strong>Повторный звонок</strong><span>Уточните, посмотрел ли клиент предложение, и ответьте на вопросы.</span></div></div>
  <div class="tr-deal-route__step"><div class="tr-deal-route__marker">5</div><div class="tr-deal-route__body"><strong>Встреча</strong><span>Если она нужна, личный контакт поможет укрепить доверие.</span></div></div>
  <div class="tr-deal-route__step"><div class="tr-deal-route__marker">6</div><div class="tr-deal-route__body"><strong>Получение заявки</strong><span>Уточните позиции, объёмы, сроки и другие условия.</span></div></div>
  <div class="tr-deal-route__step"><div class="tr-deal-route__marker">7</div><div class="tr-deal-route__body"><strong>Счёт</strong><span>Подготовьте его быстро и без ошибок: скорость — ваше преимущество.</span></div></div>
  <div class="tr-deal-route__step"><div class="tr-deal-route__marker">8</div><div class="tr-deal-route__body"><strong>Дожим и закрытие сделки</strong><span>Вернитесь к клиенту, ответьте на сомнения и помогите принять решение.</span></div></div>
  <div class="tr-deal-route__step"><div class="tr-deal-route__marker">9</div><div class="tr-deal-route__body"><strong>После оплаты</strong><span>Выполните обещания и поддерживайте отношения для следующего заказа.</span></div></div>
</div>`;

/**
 * Keeps the initial seed aligned with the hand-edited module content while
 * leaving the historical JSON export intact.
 */
export function improveModuleTwoLessonContent(lessonId: number, content: string) {
  if (lessonId === 7) {
    const withIntro = content.replace(
      /<div class="tr-callout tr-callout--info">\s*<strong>Добро пожаловать в мир металлоторговли!<\/strong>[\s\S]*?<\/div>/,
      careerIntro,
    );

    return withIntro.replace(
      /<div class="tr-career-map">[\s\S]*?<\/div>\s*<h3>Что нужно для успеха\?<\/h3>/,
      `${careerPath}\n\n<h3>Что нужно для успеха?</h3>`,
    );
  }

  if (lessonId === 8) {
    return content.replace(
      /<p>Давайте разберём каждый этап простыми словами\.<\/p>\s*<svg[\s\S]*?<\/svg>/,
      `<p>Давайте разберём каждый этап простыми словами.</p>\n\n${dealRoute}`,
    );
  }

  return content;
}
